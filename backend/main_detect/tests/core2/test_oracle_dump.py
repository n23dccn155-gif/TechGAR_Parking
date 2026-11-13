from techgar.core2.oracle_dump import _p37_prediction_source


def test_engine_sources_match_p37_prediction_source_contract():
    assert _p37_prediction_source("measured") == "measurement"
    assert _p37_prediction_source("held") == "held"


def test_edge_ghost_geometry_is_clipped_and_5_to_6cm_from_real():
    import math
    import numpy as np
    from techgar.core2.oracle_dump import _edge_ghost
    from techgar.core2.types import Blob
    real = Blob(0, 1, .04, (698, 482, 85, 35), (74.,50.), 2975, False, 1., None)
    transform = np.array([[.1,0,0],[0,.1,0],[0,0,1]])
    ghost = _edge_ghost(real, transform, 0, 790)
    assert ghost is not None and ghost.roi_clipped
    assert 5 <= math.dist(real.xy, ghost.xy) <= 6
    assert 780 <= ghost.bbox[0] + ghost.bbox[2]/2 <= 810
    assert _p37_prediction_source("predicted") == "predicted"
