# SEVEN NOTES: FADING — Website

A self-contained, no-build static website. The existing project scaffold is preserved; this website lives in `site/`.

## Preview

From the project root:

```sh
python3 -m http.server 3000 --bind 0.0.0.0 --directory site
```

Open `/` on the preview port. There are no external dependencies, APIs, images, fonts, or backend requirements. Optional musical tones are generated in the browser with Web Audio after user interaction; mute is available at all times.
