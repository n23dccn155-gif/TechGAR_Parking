"""Experimental CNN feature extractor requiring explicit trained weights.

This module is deliberately not enabled by the motion-tracking pipeline.  A
randomly initialized network is not a Re-ID model and must never contribute to
production identity decisions.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple

import cv2
import numpy as np

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False
    torch = None  # type: ignore
    nn = None  # type: ignore
    F = None  # type: ignore


if HAS_TORCH:

    class _LightweightReID(nn.Module):
        """Small CNN (4 conv layers) for vehicle Re-ID on CPU.

        Input:  64×64 BGR → Feature: 128-d embedding (L2-normalized).
        Parameters: ~350K (CPU-friendly, no GPU required).
        """

        def __init__(self, feature_dim: int = 128) -> None:
            super().__init__()
            self.features = nn.Sequential(
                # 64×64 → 32×32
                nn.Conv2d(3, 32, 3, padding=1),
                nn.BatchNorm2d(32),
                nn.ReLU(inplace=True),
                nn.MaxPool2d(2, 2),
                # 32×32 → 16×16
                nn.Conv2d(32, 64, 3, padding=1),
                nn.BatchNorm2d(64),
                nn.ReLU(inplace=True),
                nn.MaxPool2d(2, 2),
                # 16×16 → 8×8
                nn.Conv2d(64, 128, 3, padding=1),
                nn.BatchNorm2d(128),
                nn.ReLU(inplace=True),
                # 8×8 → 4×4
                nn.Conv2d(128, 256, 3, padding=1),
                nn.BatchNorm2d(256),
                nn.ReLU(inplace=True),
                nn.AdaptiveAvgPool2d(1),
            )
            self.classifier = nn.Sequential(
                nn.Flatten(),
                nn.Linear(256, feature_dim),
                nn.BatchNorm1d(feature_dim),
                nn.ReLU(inplace=True),
            )

        def forward(self, x):
            return self.classifier(self.features(x))

    class DeepReIDExtractor:
        """CPU-friendly vehicle appearance extractor.

        Features are 128-dimensional L2-normalized vectors.
        Distance is 1 - cosine_similarity (lower = more similar).

        Usage:
            >>> extractor = DeepReIDExtractor()
            >>> feat = extractor.extract(cv2.imread("car.jpg"))
            >>> dist = extractor.distance(feat1, feat2)
        """

        def __init__(
            self,
            feature_dim: int = 128,
            device: str = "cpu",
            *,
            weights_path: str | Path | None = None,
        ) -> None:
            if weights_path is None:
                raise ValueError(
                    "DeepReID requires explicit trained weights; random "
                    "initialization is not supported"
                )
            self.feature_dim = feature_dim
            self.device = torch.device(device)
            self.weights_path = Path(weights_path)
            self._model: Optional[nn.Module] = None
            self._initialized = False

        def _init_model(self) -> None:
            if self._initialized:
                return
            if not HAS_TORCH:
                raise ImportError("PyTorch not installed — cannot use DeepReID")
            if not self.weights_path.is_file():
                raise FileNotFoundError(
                    f"DeepReID weights not found: {self.weights_path}"
                )
            self._model = _LightweightReID(feature_dim=self.feature_dim).to(self.device)
            state = torch.load(
                self.weights_path,
                map_location=self.device,
                weights_only=True,
            )
            if isinstance(state, dict) and "state_dict" in state:
                state = state["state_dict"]
            self._model.load_state_dict(state, strict=True)
            self._model.eval()
            self._initialized = True

        @staticmethod
        def _preprocess(image: np.ndarray, size: Tuple[int, int] = (64, 64)) -> torch.Tensor:
            """Resize BGR numpy → normalized 1×3×H×W tensor on CPU."""
            if image is None or image.size == 0:
                return torch.zeros(1, 3, size[0], size[1], dtype=torch.float32)
            resized = cv2.resize(image, size, interpolation=cv2.INTER_AREA)
            rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
            tensor = torch.from_numpy(rgb).float() / 255.0
            tensor = tensor.permute(2, 0, 1).unsqueeze(0)  # 1×3×H×W
            # Normalize with ImageNet stats (optional, helps if pre-trained later)
            mean = torch.tensor([0.485, 0.456, 0.406]).unsqueeze(1).unsqueeze(1)
            std = torch.tensor([0.229, 0.224, 0.225]).unsqueeze(1).unsqueeze(1)
            tensor = (tensor - mean) / std
            return tensor

        def extract(self, image: np.ndarray) -> np.ndarray:
            """Extract 128-d L2-normalized feature from a vehicle crop (BGR numpy)."""
            self._init_model()
            if self._model is None:
                raise RuntimeError("Model not initialized")
            tensor = self._preprocess(image).to(self.device)
            with torch.no_grad():
                feature = self._model(tensor)
            feature = F.normalize(feature, p=2, dim=1).cpu().numpy().flatten()
            return feature.astype(np.float32)

        @staticmethod
        def distance(features_a: np.ndarray, features_b: np.ndarray) -> float:
            """Cosine distance: 1 - cosine_similarity (lower = more similar)."""
            a = np.asarray(features_a, dtype=np.float32)
            b = np.asarray(features_b, dtype=np.float32)
            if a.size == 0 or b.size == 0:
                return 1.0
            norm_a = np.linalg.norm(a)
            norm_b = np.linalg.norm(b)
            if norm_a < 1e-8 or norm_b < 1e-8:
                return 1.0
            cosine = float(np.dot(a, b) / (norm_a * norm_b))
            return float(max(0.0, 1.0 - cosine))

else:

    class DeepReIDExtractor:  # type: ignore[no-redef]
        """Unavailable implementation used when the optional dependency is absent."""

        def __init__(self, **kwargs: object) -> None:  # type: ignore[override]
            raise ImportError("PyTorch is required for the experimental DeepReID extractor")

        def extract(self, image: np.ndarray) -> np.ndarray:
            raise RuntimeError("DeepReID extractor is unavailable")

        @staticmethod
        def distance(features_a: np.ndarray, features_b: np.ndarray) -> float:
            raise RuntimeError("DeepReID extractor is unavailable")
