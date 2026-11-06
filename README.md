# sn1wfy.net

My personal site. Not a CV and not a list of services (those live at [omnexis.net](https://omnexis.net)).
It's a night walk: a moon, some crows, and the things I can't leave alone.

- **The moon** is rendered live in three.js from NASA's LRO maps, shaded with a lunar reflectance
  model and lit to match tonight's real phase.
- **The wolf** is BackMaster's emblem, traced from the daemon's own C++ source and turned into neon.
- **The stars** are the 252,000 lines I've written, one star per hundred.
- **Nothing is fetched from a CDN.** three.js, fonts, textures and sounds are all self-hosted here.

Static files, no build step. To run it locally:

```sh
python3 -m http.server 8765   # then open http://localhost:8765
```

Asset credits are in `assets/**/CREDITS.txt`.
