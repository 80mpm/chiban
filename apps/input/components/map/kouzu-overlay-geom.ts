// 案件の公図画像を地図に重ねるための幾何計算（Issue #44。Leaflet に依存しない純関数）。
// 画像は中心・縮尺（1 画素あたりのメートル）・回転で地図に置く。メートル ⇄ 緯度経度は
// PolygonDrawMap と同じ緯度補正付きの平面近似（METER_PER_LAT = 111000）。
// SSR されるクライアントコンポーネントからも import できるよう、Leaflet はここで読まない。

import type { KouzuOverlay, LatLng } from "@chiban/shared/lib/types";

const METER_PER_LAT = 111000;
const meterPerLng = (lat: number) => 111000 * Math.cos((lat * Math.PI) / 180);

/** 中心から東 dE・北 dN メートルの緯度経度。 */
export function offsetFrom(center: LatLng, dE: number, dN: number): LatLng {
  return [center[0] + dN / METER_PER_LAT, center[1] + dE / meterPerLng(center[0])];
}

/** 中心から見た点の東西・南北のメートル。 */
export function metersFrom(center: LatLng, p: LatLng): { dE: number; dN: number } {
  return {
    dE: (p[1] - center[1]) * meterPerLng(center[0]),
    dN: (p[0] - center[0]) * METER_PER_LAT,
  };
}

/** 画像の画素 (x 右・y 下) を地図の緯度経度へ移す。 */
export function pixelToLatLng(o: KouzuOverlay, x: number, y: number): LatLng {
  const e = (x - o.imageWidth / 2) * o.metersPerPixel;
  const n = -(y - o.imageHeight / 2) * o.metersPerPixel;
  // 時計回りに rotationDeg 回す（東=x・北=y の座標系で）
  const t = (o.rotationDeg * Math.PI) / 180;
  const dE = e * Math.cos(t) + n * Math.sin(t);
  const dN = -e * Math.sin(t) + n * Math.cos(t);
  return offsetFrom(o.center, dE, dN);
}

/** 画像の四隅（左上・右上・右下・左下）。fitBounds や回転ハンドルの位置に使う。 */
export function overlayCorners(o: KouzuOverlay): LatLng[] {
  return [
    pixelToLatLng(o, 0, 0),
    pixelToLatLng(o, o.imageWidth, 0),
    pixelToLatLng(o, o.imageWidth, o.imageHeight),
    pixelToLatLng(o, 0, o.imageHeight),
  ];
}

/**
 * 右上隅のハンドルを p へ動かしたときの縮尺・回転。
 * 中心から隅までの距離で縮尺を、隅の方位の変化で回転を決める（中心は動かさない）。
 */
export function scaleRotateFromCorner(
  o: KouzuOverlay,
  p: LatLng,
): Pick<KouzuOverlay, "metersPerPixel" | "rotationDeg"> {
  const { dE, dN } = metersFrom(o.center, p);
  const halfDiagPx = Math.hypot(o.imageWidth / 2, o.imageHeight / 2);
  const dist = Math.hypot(dE, dN);
  // 回転前の右上隅の方位（東から反時計回り）と、いまの方位の差 = 時計回りの回転角
  const base = Math.atan2(o.imageHeight / 2, o.imageWidth / 2);
  const now = Math.atan2(dN, dE);
  let deg = ((base - now) * 180) / Math.PI;
  deg = ((((deg + 180) % 360) + 360) % 360) - 180;
  return {
    metersPerPixel: Math.max(dist / halfDiagPx, 1e-6),
    rotationDeg: Math.round(deg * 10) / 10,
  };
}

/** 初期の位置合わせ（まだ合わせていない公図用）。画像の幅を widthM メートルにして中心に置く。 */
export function initialOverlay(
  center: LatLng,
  imageWidth: number,
  imageHeight: number,
  widthM = 150,
): KouzuOverlay {
  return {
    center,
    metersPerPixel: widthM / imageWidth,
    rotationDeg: 0,
    opacity: 0.6,
    imageWidth,
    imageHeight,
  };
}
