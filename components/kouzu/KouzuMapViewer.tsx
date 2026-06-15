"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const SHEET_COLORS = ["#2563eb", "#d97706", "#059669", "#db2777"];
const LABEL_MIN_ZOOM = 17;

interface Sheet {
  id: string;
  name: string;
  count: number;
  approx?: boolean;
}
interface ParcelProps {
  parcelId: string;
  sheetId: string;
  sheetName: string;
  oaza: string;
  chome?: string;
  chiban: string;
  precision?: string;
  coordType?: string;
}
interface KouzuData {
  crs: string;
  sheets: Sheet[];
  geojson: { type: "FeatureCollection"; features: GeoJSON.Feature[] };
}

interface SheetEntry {
  sheet: Sheet;
  layer: L.GeoJSON;
  color: string;
  bounds: L.LatLngBounds;
}

function sheetDisplayName(sheet: Sheet, features: GeoJSON.Feature[]): string {
  if (!/^\d+_/.test(sheet.name)) return sheet.name;
  const f = features.find((ft) => (ft.properties as ParcelProps).sheetId === sheet.id);
  if (!f) return sheet.name;
  const p = f.properties as ParcelProps;
  return `台東区${p.oaza}${p.chome}地区`;
}

/**
 * 登記所備付地図ビューア（旧 kouzu-map.html / kouzu-map.js）。
 * public/data/kouzu_xml_data.json を読み、ZENRIN 地図に図面を重ねる。
 * DataStore は使わない閲覧専用画面。利用側は dynamic(ssr:false) で読み込む。
 */
export default function KouzuMapViewer() {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const entriesRef = useRef<Map<string, SheetEntry>>(new Map());
  const selectedRef = useRef<L.Path | null>(null);

  const [data, setData] = useState<KouzuData | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<{ p: ParcelProps; color: string } | null>(null);

  useEffect(() => {
    fetch("/data/kouzu_xml_data.json")
      .then((r) => r.json())
      .then((d: KouzuData) => {
        setData(d);
        setVisible(Object.fromEntries(d.sheets.map((s) => [s.id, true])));
      });
  }, []);

  useEffect(() => {
    const el = elRef.current;
    if (!el || !data) return;

    const map = L.map(el, { zoomControl: true, maxZoom: 22, attributionControl: false });
    L.tileLayer("/tile/{z}/{x}/{y}.png", { maxZoom: 22 }).addTo(map);
    mapRef.current = map;

    const features = data.geojson.features;
    const entries = entriesRef.current;
    entries.clear();

    data.sheets.forEach((sheet, idx) => {
      const color = SHEET_COLORS[idx % SHEET_COLORS.length];
      const layer = L.geoJSON(
        {
          type: "FeatureCollection",
          features: features.filter((f) => (f.properties as ParcelProps).sheetId === sheet.id),
        } as GeoJSON.FeatureCollection,
        {
          style: () => ({ color, weight: 1.5, fillColor: color, fillOpacity: 0.18 }),
          onEachFeature: (feature, path) => {
            const pp = feature.properties as ParcelProps;
            path.bindTooltip(pp.chiban, {
              permanent: true,
              direction: "center",
              className: "map-label label-chiban",
              interactive: false,
            });
            const gp = path as L.Path;
            path.on("click", () => {
              if (selectedRef.current) selectedRef.current.setStyle({ weight: 1.5, fillOpacity: 0.18 });
              selectedRef.current = gp;
              gp.setStyle({ weight: 3, fillOpacity: 0.45 });
              setSelected({ p: pp, color });
            });
            path.on("mouseover", () => {
              if (gp !== selectedRef.current) gp.setStyle({ fillOpacity: 0.4 });
            });
            path.on("mouseout", () => {
              if (gp !== selectedRef.current) gp.setStyle({ fillOpacity: 0.18 });
            });
          },
        },
      );
      layer.addTo(map);
      entries.set(sheet.id, { sheet, layer, color, bounds: layer.getBounds() });
    });

    const allBounds = [...entries.values()]
      .map((s) => s.bounds)
      .reduce<L.LatLngBounds | null>(
        (acc, b) => (acc ? acc.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast())),
        null,
      );
    if (allBounds) map.fitBounds(allBounds, { padding: [32, 32] });

    const updateLabels = () => {
      const show = map.getZoom() >= LABEL_MIN_ZOOM;
      el.querySelectorAll<HTMLElement>(".map-label").forEach((lbl) => {
        lbl.style.display = show ? "" : "none";
      });
    };
    map.on("zoomend", updateLabels);
    map.whenReady(updateLabels);
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      entriesRef.current = new Map();
      selectedRef.current = null;
    };
  }, [data]);

  function toggleSheet(id: string, checked: boolean) {
    setVisible((v) => ({ ...v, [id]: checked }));
    const map = mapRef.current;
    const entry = entriesRef.current.get(id);
    if (!map || !entry) return;
    if (checked) entry.layer.addTo(map);
    else map.removeLayer(entry.layer);
  }

  function focusSheet(id: string) {
    const map = mapRef.current;
    const entry = entriesRef.current.get(id);
    if (!map || !entry) return;
    if (!visible[id]) toggleSheet(id, true);
    map.fitBounds(entry.bounds, { padding: [40, 40] });
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative min-w-0 flex-1 bg-[#eef2f7]">
        <div ref={elRef} className="absolute inset-0" />
      </div>

      <aside className="flex w-[340px] flex-none flex-col overflow-y-auto border-l border-[#d4dde6] bg-white">
        <section className="border-b border-[#eef2f7] p-4">
          <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">
            図面レイヤー（公共座標系のみ）
          </h2>
          {data?.sheets.map((sheet) => {
            const entry = entriesRef.current.get(sheet.id);
            const color = SHEET_COLORS[data.sheets.indexOf(sheet) % SHEET_COLORS.length];
            return (
              <div
                key={sheet.id}
                onClick={() => focusSheet(sheet.id)}
                className="-mx-2 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[#f1f5f9]"
                style={{ color }}
              >
                <input
                  type="checkbox"
                  checked={visible[sheet.id] ?? true}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => toggleSheet(sheet.id, e.target.checked)}
                  className="flex-none cursor-pointer"
                />
                <span
                  className="size-3.5 flex-none rounded-[3px] border-2 border-current opacity-90"
                  style={{ background: color + "33" }}
                />
                <span className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[#1e293b]">
                    {sheetDisplayName(sheet, data.geojson.features)}
                  </div>
                  <div className="truncate text-[10px] text-[#94a3b8]">
                    図面: {sheet.name}
                    {sheet.approx ? "（任意座標系・位置は概算）" : ""}
                  </div>
                </span>
                <span className="flex-none rounded-lg bg-[#f1f5f9] px-2 py-0.5 text-[11px] text-[#475569]">
                  {sheet.count}筆{entry ? "" : ""}
                </span>
              </div>
            );
          })}
        </section>

        <section className="border-b border-[#eef2f7] p-4">
          <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">
            筆の詳細
          </h2>
          {!selected ? (
            <div className="py-1.5 text-xs text-[#94a3b8]">
              地図上の筆ポリゴンをクリックすると詳細を表示します。
            </div>
          ) : (
            <div className="grid grid-cols-[88px_1fr] gap-x-2.5 gap-y-1.5">
              {(
                [
                  ["地番", selected.p.chiban, true],
                  ["所在", `台東区${selected.p.oaza}${selected.p.chome || ""}`, false],
                  ["図面名", selected.p.sheetName, false],
                  ["精度区分", selected.p.precision || "—", false],
                  ["座標値種別", selected.p.coordType || "—", false],
                  ["座標系", data!.crs, false],
                ] as [string, string, boolean][]
              ).map(([label, value, big]) => (
                <div key={label} className="contents">
                  <div className="pt-px text-[11px] text-[#64748b]">{label}</div>
                  <div
                    className={`break-all text-xs leading-relaxed ${big ? "text-base font-bold" : "text-[#1e293b]"}`}
                    style={big ? { color: selected.color } : undefined}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="p-4">
          <div className="text-[10px] leading-relaxed text-[#94a3b8]">
            <b className="text-[#64748b]">出典:</b> 登記所備付地図データ（法務省）— G空間情報センターから取得した
            台東区（13106）2026年版のうち、座標系が「公共座標9系」の4図面のみを表示。
            平面直角座標系第IX系（JGD2011）から緯度経度に変換済み。
            <br />
            任意座標系の図面（140図面）は絶対位置を持たないため本ビューには表示できない。
          </div>
        </section>
      </aside>
    </div>
  );
}
