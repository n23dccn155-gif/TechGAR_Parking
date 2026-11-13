"""Single-slot, nonblocking handoff for optional asynchronous rendering."""
from __future__ import annotations

import queue
import threading
from typing import Callable, Any


class LatestRenderQueue:
    """The producer never waits for a render; obsolete pending frames are dropped."""

    def __init__(self, render: Callable[[Any], None]) -> None:
        self._queue: queue.Queue = queue.Queue(maxsize=1)
        self._render = render
        self._stop = threading.Event()
        self._error: BaseException | None = None
        self.submitted = 0
        self.overwritten = 0
        self.rendered = 0
        self._thread = threading.Thread(target=self._run, name='latest-render', daemon=True)
        self._thread.start()

    def submit(self, snapshot: Any) -> bool:
        if self._stop.is_set() or self._error is not None:
            return False
        self.submitted += 1
        try:
            self._queue.put_nowait(snapshot)
            return True
        except queue.Full:
            try:
                self._queue.get_nowait()
                self.overwritten += 1
            except queue.Empty:
                pass
            try:
                self._queue.put_nowait(snapshot)
                return True
            except queue.Full:
                self.overwritten += 1
                return False

    def submit_nonblocking(self, snapshot: Any) -> bool:
        """Never wait for the queue mutex: drop this preview on contention."""
        if self._stop.is_set() or self._error is not None:
            return False
        self.submitted += 1
        if not self._queue.mutex.acquire(blocking=False):
            self.overwritten += 1
            return True
        try:
            if self._queue._qsize():
                self._queue._get()
                self.overwritten += 1
            self._queue._put(snapshot)
            self._queue.not_empty.notify()
            return True
        finally:
            self._queue.mutex.release()

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                snapshot = self._queue.get(timeout=0.05)
            except queue.Empty:
                continue
            try:
                self._render(snapshot)
                self.rendered += 1
            except BaseException as exc:
                self._error = exc
                self._stop.set()

    def close(self, timeout: float = 5.0) -> None:
        self._stop.set()
        self._thread.join(timeout)
        if self._thread.is_alive():
            raise RuntimeError('render worker did not stop')
        if self._error is not None:
            raise RuntimeError('render worker failed') from self._error
