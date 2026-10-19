"""Pelvimetry and thorax measurements on vertex arrays (metres, body frame: x = left, y = back, z = up).
Used by build_skeleton.py to fit a female pelvis/rib cage, and by diag scripts to report before/after."""
import numpy as np


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


def landmarks(hl, hr, sac, hipc_l, hipc_r):
    """hl/hr: hip bone vertices, sac: sacrum vertices, hipc_*: hip joint centres. Returns dict of points."""
    H = np.vstack([hl, hr]); acet = (hipc_l + hipc_r) / 2
    mid = H[np.abs(H[:, 0]) < .018]
    front_mid = mid[mid[:, 1] < acet[1]]
    sym_top = front_mid[np.argmax(front_mid[:, 2])]
    cen = H[(np.abs(H[:, 0]) < .008) & (H[:, 1] < acet[1] + .01)]
    sym_bot = cen[np.argmin(cen[:, 2])]                                                         # apex of the pubic arch
    sym_post = front_mid[front_mid[:, 2] > sym_top[2] - .012]; sym_post = sym_post[np.argmax(sym_post[:, 1])]   # posterior-superior edge
    sm = sac[np.abs(sac[:, 0]) < .015]; up = sm[sm[:, 2] > sm[:, 2].max() - .03]
    prom = up[np.argmin(up[:, 1])]
    return dict(acet=acet, sym_top=sym_top, sym_bot=sym_bot, sym_post=sym_post, prom=prom)


def measure(hl, hr, sac, hipc_l, hipc_r):
    L = landmarks(hl, hr, sac, hipc_l, hipc_r); acet = L["acet"]; out = {}
    out["true_conjugate"] = float(np.linalg.norm(L["prom"] - L["sym_post"]))
    # inlet plane through promontory and the top of the symphysis, horizontal in x
    a, b = L["prom"], L["sym_post"]; ap = (b - a); n = np.cross(ap, [1, 0, 0]); n /= np.linalg.norm(n)
    def brim(h):
        d = (h - a) @ n; s = h[np.abs(d) < .004]
        t = ((s - a) @ ap) / (ap @ ap); s, t = s[(t > .15) & (t < .85)], t[(t > .15) & (t < .85)]
        bins = np.round(t * 20)
        return {k: np.abs(s[bins == k, 0]).min() for k in np.unique(bins)}
    # inlet transverse: widest span of the pelvic brim, read just above the hip joints behind their centre line
    def wall(h, z):
        s = h[(np.abs(h[:, 2] - z) < .004) & (h[:, 1] > acet[1] - .015) & (h[:, 1] < acet[1] + .05)]; return np.abs(s[:, 0]).min() if len(s) else np.nan
    out["inlet_transverse"] = float(np.nanmax([wall(hl, acet[2] + dz) + wall(hr, acet[2] + dz) for dz in (.02, .03, .04)]))
    zt = min(hl[:, 2].min(), hr[:, 2].min())
    def band_min(h, z0, z1, post=True):
        s = h[(h[:, 2] > z0) & (h[:, 2] < z1) & ((h[:, 1] > acet[1]) if post else True)]; return np.abs(s[:, 0]).min()
    out["interspinous"] = float(band_min(hl, zt + .035, acet[2] - .015) + band_min(hr, zt + .035, acet[2] - .015))
    def tubin(h):
        s = h[(h[:, 2] < zt + .015) & (h[:, 1] > acet[1] + .015)]; return np.abs(s[:, 0]).min()
    out["intertuberous"] = float(tubin(hl) + tubin(hr))          # posterior part: the tuberosities, not the pubic arch
    # subpubic angle in the plane of the arch: apex of the arch to the inner lower edge of each ischial tuberosity
    def tub(h):
        s = h[(h[:, 2] < zt + .012) & (h[:, 1] > acet[1] + .015)]; s = s[np.argsort(np.abs(s[:, 0]))[:max(3, len(s) // 5)]]; return s.mean(0)
    A = L["sym_bot"]; u, v = tub(hl) - A, tub(hr) - A
    out["subpubic_angle"] = float(np.degrees(np.arccos(u @ v / np.linalg.norm(u) / np.linalg.norm(v))))
    H = np.vstack([hl, hr])
    out["bi_iliac"] = float(2 * np.abs(H[:, 0]).max())
    out["pelvis_height"] = float(H[:, 2].max() - H[:, 2].min())
    return out, L


# typical adult female values (obstetric / anatomy textbooks), metres and degrees
FEMALE = {"true_conjugate": .113, "inlet_transverse": .132, "interspinous": .105, "intertuberous": .112, "subpubic_angle": 85.0}
