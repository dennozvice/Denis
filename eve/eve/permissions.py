"""Permessi di macOS: chiede esplicitamente l'accesso al microfono a nome dell'app.

Senza questa richiesta macOS la attribuisce al processo Python, e l'app non compare
in Privacy e sicurezza › Microfono. Richiede pyobjc-framework-AVFoundation
(installato con l'extra "window"); altrove non fa nulla.
"""

from __future__ import annotations

import platform
import threading


def request_microphone(timeout: float = 120.0) -> bool | None:
    """True se consentito, False se negato, None se non è stato possibile chiedere."""
    if platform.system() != "Darwin":
        return None
    try:
        import AVFoundation  # type: ignore
    except ImportError:
        return None
    try:
        status = AVFoundation.AVCaptureDevice.authorizationStatusForMediaType_(AVFoundation.AVMediaTypeAudio)
    except Exception:
        return None
    # 3 = autorizzato, 2 = negato, 1 = limitato, 0 = non ancora chiesto
    if status == 3:
        return True
    if status in (1, 2):
        return False
    done = threading.Event()
    answer: list[bool] = []

    def handler(granted: bool) -> None:
        answer.append(bool(granted))
        done.set()

    try:
        AVFoundation.AVCaptureDevice.requestAccessForMediaType_completionHandler_(AVFoundation.AVMediaTypeAudio, handler)
    except Exception:
        return None
    done.wait(timeout)
    return answer[0] if answer else None
