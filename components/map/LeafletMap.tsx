"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface LeafletMapProps {
  center: L.LatLngExpression;
  zoom: number;
  /** タイルレイヤーを敷くか（既定 true）。false で白地図にする。 */
  tiles?: boolean;
  /**
   * 地図生成後に一度だけ呼ばれる。ポリゴン描画などはここで行う。
   * 返り値に cleanup を返すとアンマウント時に呼ばれる。
   */
  onReady?: (map: L.Map) => void | (() => void);
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 素の Leaflet を命令的に扱う基盤コンポーネント。
 * Leaflet は window 前提なので、利用側は next/dynamic で ssr:false 指定で読み込むこと。
 * ZENRIN タイルは同一オリジンの /tile/{z}/{x}/{y}.png（タイルプロキシ）から取得する。
 */
export default function LeafletMap({
  center,
  zoom,
  tiles = true,
  onReady,
  className,
  style,
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, { center, zoom, zoomControl: true });
    if (tiles) {
      L.tileLayer("/tile/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; ZENRIN",
      }).addTo(map);
    }
    // コンテナのサイズ確定後にタイルを正しく敷き直す
    setTimeout(() => map.invalidateSize(), 0);

    const cleanup = onReadyRef.current?.(map);

    return () => {
      if (typeof cleanup === "function") cleanup();
      map.remove();
    };
    // 初期化は一度きり。center/zoom の追従は利用側が map を操作する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={className} style={style} />;
}
