#!/bin/sh
# Normalizes a rendered video's soundtrack to -16 LUFS integrated (true peak -1.5 dBTP) with a
# two-pass linear loudnorm, keeping the picture untouched. Usage: loudness.sh <in.mp4> <out.mp4>
set -eu
in="$1"
out="$2"
stats=$(ffmpeg -hide_banner -i "$in" -vn -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
field() { echo "$stats" | sed -n "s/.*\"$1\" : \"\\([^\"]*\)\".*/\\1/p"; }
mi=$(field input_i); mtp=$(field input_tp); mlra=$(field input_lra); mth=$(field input_thresh); off=$(field target_offset)
if [ -z "$mi" ]; then
  echo "could not measure loudness of $in" >&2
  exit 1
fi
ffmpeg -v error -y -i "$in" -c:v copy \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$mi:measured_TP=$mtp:measured_LRA=$mlra:measured_thresh=$mth:offset=$off:linear=true,aresample=48000" \
  -c:a aac -b:a 192k "$out"
after=$(ffmpeg -hide_banner -i "$out" -vn -af ebur128=peak=true -f null - 2>&1 | awk '/^ +I:/ { i = $2 } /^ +Peak:/ { p = $2 } END { print i " LUFS, peak " p " dBFS" }')
echo "$out: was $mi LUFS, now $after"
