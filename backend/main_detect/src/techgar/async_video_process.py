"""Bounded video encoder process for optional asynchronous rendering."""
from __future__ import annotations
import multiprocessing as mp
import queue
import os
import time
from .latest_render_queue import LatestRenderQueue


def _signal_stop_key(key, stop_event):
    if (key & 0xff) in (27, ord('q'), ord('Q')):
        stop_event.set()


def _encode(queue_in, result, specs, replay_dir=None, scale=1.0, codec='mp4v', display=False, preview_scale=1.0, stop_event=None):
    import cv2
    if replay_dir: cv2.setNumThreads(1)
    writers = {}
    counts = {}
    captures = {}
    cpu_start, wall_start = time.process_time(), time.perf_counter()
    try:
        if replay_dir:
            import sys
            from pathlib import Path
            sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
            from two_camera import render_runtime_frame
            import numpy as np
            for camera in ('cam1', 'cam2'):
                captures[camera] = cv2.VideoCapture(str(replay_dir / f'raw_{camera}.mp4'))
                if not captures[camera].isOpened(): raise RuntimeError(f'cannot open replay video {camera}')
        for key, (path, fps, size) in specs.items():
            size = (tuple(max(2, int(n * scale) // 2 * 2) for n in size)
                    if replay_dir and scale != 1.0 else tuple(size))
            writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*codec), fps, size)
            if not writer.isOpened(): raise RuntimeError(f'cannot open video writer {path}')
            writers[key] = writer
            counts[key] = 0
        while True:
            packet = queue_in.get()
            if packet is None: break
            if replay_dir:
                frames={};rendered={}
                for camera,cap in captures.items():
                    target=packet['source_frame_idx']-1
                    current=int(cap.get(cv2.CAP_PROP_POS_FRAMES))
                    if current < target and target-current <= 12:
                        for _ in range(target-current):
                            if not cap.grab(): raise RuntimeError(f'replay render cannot skip {camera} frame')
                    elif current != target:
                        if not cap.set(cv2.CAP_PROP_POS_FRAMES,target): raise RuntimeError(f'replay render cannot seek {camera}')
                    ok,frame=cap.read()
                    if not ok: raise RuntimeError(f'replay render cannot read {camera} frame {target+1}')
                    frames[camera]=frame
                    rendered[camera]=render_runtime_frame(frame.copy(),packet['payloads'][camera])
                if display:
                    view=np.hstack([cv2.resize(rendered[c],(max(1,int(640*preview_scale)),max(1,int(360*preview_scale)))) for c in ('cam1','cam2')])
                    cv2.imshow('Core2L replay render',view)
                    _signal_stop_key(cv2.waitKey(1), stop_event)
                packet={key:(frames if key.startswith('raw_') else rendered)[key.split('_',1)[1]] for key in writers}
            for key, image in packet.items():
                if scale != 1.0:
                    h,w=image.shape[:2];image=cv2.resize(image,(max(2,int(w*scale)//2*2),max(2,int(h*scale)//2*2)))
                writers[key].write(image)
                counts[key] += 1
        result.send({'counts': counts, 'error': None, 'cpu_s': time.process_time()-cpu_start,
                     'wall_s': time.perf_counter()-wall_start})
    except BaseException as exc:
        result.send({'counts': counts, 'error': repr(exc)})
    finally:
        for writer in writers.values(): writer.release()
        for capture in captures.values(): capture.release()
        result.close()


class AsyncVideoProcess:
    def __init__(self, specs, capacity=2, *, replay_dir=None, scale=1.0, codec='mp4v', display=False, preview_scale=1.0):
        if capacity < 1: raise ValueError('capacity must be positive')
        ctx = mp.get_context('spawn')
        self._queue = ctx.Queue(maxsize=capacity)
        self._result, send = ctx.Pipe(duplex=False)
        self._stop_event = ctx.Event()
        self._process = ctx.Process(target=_encode, args=(self._queue, send, specs, replay_dir, scale, codec, display, preview_scale, self._stop_event), daemon=True)
        self._process.start()
        send.close()
        # Only the relay may wait for the process queue. The renderer replaces
        # the relay's single pending packet without waiting for video encoding.
        self._relay = LatestRenderQueue(self._send)

    def _send(self, packet):
        while self._process.is_alive():
            try:
                self._queue.put(packet, timeout=0.2)
                return
            except queue.Full:
                continue
        raise RuntimeError('video process stopped while sending')

    @property
    def dropped(self):
        return self._relay.overwritten

    @property
    def stop_requested(self):
        return self._stop_event.is_set()

    def submit(self, packet):
        if not self._process.is_alive(): raise RuntimeError('video process stopped')
        return self._relay.submit(packet)

    def submit_nonblocking(self, packet):
        # Relay reports a dead encoder through its error state; never wait on
        # its mutex or OS process state on the processing thread.
        return self._relay.submit_nonblocking(packet)

    def close(self, timeout=30):
        try:
            try:
                self._relay.close(timeout=timeout)
            except Exception:
                if self._process.is_alive():
                    self._process.terminate(); self._process.join(5)
                raise
            self._queue.put(None, timeout=timeout)
            self._process.join(timeout)
            if self._process.is_alive():
                self._process.terminate(); self._process.join(5)
                raise RuntimeError('video process failed to stop')
            if not self._result.poll(): raise RuntimeError('video process returned no result')
            result = self._result.recv()
            if result['error']: raise RuntimeError(result['error'])
            if os.environ.get('TECHGAR_ENCODER_PROFILE') == '1':
                print(f"[ENCODER_PROFILE] cpu_s={result['cpu_s']:.4f} wall_s={result['wall_s']:.4f}", flush=True)
            return result['counts']
        finally:
            self._queue.close()
            self._result.close()
