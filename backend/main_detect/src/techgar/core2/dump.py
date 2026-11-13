"""Deterministic versioned CORE2 Blob streams (JSON Lines inside gzip)."""
from __future__ import annotations
from dataclasses import asdict
import gzip
import io
import json
import math
import queue
import threading
from pathlib import Path
from typing import Iterator, Mapping
from .types import Blob

FORMAT_VERSION = 1

class BlobDumpWriter:
    """Write exact Blob objects supplied to an engine step before that step."""
    def __init__(self, path: str | Path, *, video: str, stride: int,
                 cameras: Mapping[int, str], core_version: str,
                 provenance: str = "core2_m1", engine_inputs: dict | None = None) -> None:
        if stride < 1 or not cameras or not video or not core_version:
            raise ValueError("video, cameras, version and positive stride are required")
        self._raw = open(path, "wb")
        self._gzip = gzip.GzipFile(filename="", mode="wb", fileobj=self._raw, mtime=0)
        self._stream = io.TextIOWrapper(self._gzip, encoding="utf-8", newline="\n")
        self._last_t = None
        header = {"type": "header", "format": "techgar-core2-blobs",
                  "format_version": FORMAT_VERSION, "video": video,
                  "stride": stride, "cameras": {str(k): v for k, v in sorted(cameras.items())},
                  "core_version": core_version, "provenance": provenance}
        if engine_inputs is not None:
            header["engine_inputs"] = engine_inputs
        self._write(header)

    def _write(self, obj: dict) -> None:
        self._stream.write(json.dumps(obj, ensure_ascii=False, sort_keys=True,
                                      separators=(",", ":"), allow_nan=False) + "\n")

    def write_step(self, t: float, frame: int, source_frame: int,
                   blobs_by_cam: Mapping[int, list[Blob]]) -> None:
        if not math.isfinite(t) or (self._last_t is not None and t <= self._last_t):
            raise ValueError("step time must be finite and strictly increasing")
        if any(blob.cam != cam for cam, blobs in blobs_by_cam.items() for blob in blobs):
            raise ValueError("Blob camera does not match its bucket")
        self._write({"type": "step", "t": float(t), "frame_idx": int(frame),
                     "source_frame_idx": int(source_frame),
                     "blobs_by_cam": {str(cam): [asdict(blob) for blob in blobs]
                                      for cam, blobs in sorted(blobs_by_cam.items())}})
        self._last_t = t

    def close(self) -> None:
        if not self._stream.closed:
            self._stream.close()
            self._raw.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class AsyncBlobDumpWriter:
    """Bounded FIFO dump worker; preserves every frame or raises on failure."""
    def __init__(self, writer: BlobDumpWriter, capacity: int = 8):
        if capacity < 1: raise ValueError('capacity must be positive')
        self._writer = writer
        self._queue = queue.Queue(maxsize=capacity)
        self._error = None
        self._closed = False
        self._thread = threading.Thread(target=self._run, name='core2-dump', daemon=True)
        self._thread.start()

    def _run(self):
        try:
            while True:
                item = self._queue.get()
                if item is None: break
                self._writer.write_step(*item)
        except BaseException as exc:
            self._error = exc
        finally:
            try: self._writer.close()
            except BaseException as exc:
                if self._error is None: self._error = exc

    def _put(self, item):
        while self._thread.is_alive():
            if self._error is not None: break
            try:
                self._queue.put(item, timeout=.1)
                return
            except queue.Full: pass
        raise RuntimeError('core2 dump worker failed or stopped') from self._error

    def write_step(self, t, frame, source_frame, blobs_by_cam):
        if self._closed: raise RuntimeError('core2 dump already closed')
        # Blob is immutable; copy only the mutable container ownership.
        self._put((t, frame, source_frame, {cam:list(blobs) for cam,blobs in blobs_by_cam.items()}))

    def close(self):
        if self._closed: return
        self._closed = True
        self._put(None)
        self._thread.join()
        if self._error is not None: raise RuntimeError('core2 dump worker failed') from self._error


def read_dump(path: str | Path) -> tuple[dict, Iterator[dict]]:
    """Return header and streaming steps; reader closes when iterator ends."""
    stream = gzip.open(path, "rt", encoding="utf-8")
    try:
        header = json.loads(next(stream))
        if (header.get("type") != "header" or header.get("format") != "techgar-core2-blobs"
                or header.get("format_version") != FORMAT_VERSION):
            raise ValueError("unsupported core2 dump header")
    except BaseException:
        stream.close()
        raise
    def steps():
        previous = None
        try:
            for line in stream:
                record = json.loads(line)
                if record.get("type") != "step":
                    raise ValueError("invalid core2 dump record")
                t = float(record["t"])
                if not math.isfinite(t) or (previous is not None and t <= previous):
                    raise ValueError("dump timestamps must be finite and strictly increasing")
                previous = t
                buckets = {}
                for key, values in record["blobs_by_cam"].items():
                    cam = int(key)
                    buckets[cam] = []
                    for value in values:
                        value["bbox"] = tuple(value["bbox"])
                        value["xy"] = tuple(value["xy"])
                        if value["desc"] is not None:
                            value["desc"] = tuple(value["desc"])
                        blob = Blob(**value)
                        if blob.cam != cam:
                            raise ValueError("Blob camera does not match its bucket")
                        buckets[cam].append(blob)
                yield {"t": t, "frame_idx": int(record["frame_idx"]),
                       "source_frame_idx": int(record["source_frame_idx"]),
                       "blobs_by_cam": buckets}
        finally:
            stream.close()
    return header, steps()
