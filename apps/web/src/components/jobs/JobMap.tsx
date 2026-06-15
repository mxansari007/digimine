"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { JobOpening } from "@digimine/types";
import { sourceColor } from "./sourceMeta";

// Centered on India; the feed skews Indian placements with a remote tail.
const INDIA_CENTER: [number, number] = [22.9734, 78.6569];

const AMBER = "#f59e0b";

function markerIcon(source: string, featured: boolean, active: boolean): L.DivIcon {
    const color = featured ? AMBER : sourceColor(source);
    const ring = active ? `0 0 0 4px ${color}55, 0 0 18px ${color}` : `0 0 0 3px ${color}33, 0 0 10px ${color}aa`;
    const size = active ? 18 : 13;
    return L.divIcon({
        className: "",
        html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};box-shadow:${ring};border:1.5px solid #0b1220"></span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

function clusterIcon(cluster: { getChildCount: () => number }): L.DivIcon {
    const count = cluster.getChildCount();
    const size = count < 10 ? 36 : count < 50 ? 44 : 54;
    return L.divIcon({
        className: "",
        html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:rgba(20,184,166,0.16);border:1.5px solid rgba(45,212,191,0.65);color:#5eead4;font-weight:700;font-size:13px;box-shadow:0 0 22px rgba(45,212,191,0.35)">${count}</div>`,
        iconSize: L.point(size, size, true),
    });
}

/** Eases the map to the selected job when it changes. */
function FlyTo({ job }: { job: JobOpening | null }) {
    const map = useMap();
    useEffect(() => {
        const lat = job?.location.lat;
        const lng = job?.location.lng;
        if (lat != null && lng != null) {
            map.flyTo([lat, lng], Math.max(map.getZoom(), 8), { duration: 0.6 });
        }
    }, [job, map]);
    return null;
}

export default function JobMap({
    jobs,
    selectedId,
    onSelect,
}: {
    jobs: JobOpening[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}) {
    const mapped = useMemo(
        () => jobs.filter((j) => j.location.lat != null && j.location.lng != null),
        [jobs]
    );
    const selected = useMemo(() => jobs.find((j) => j.id === selectedId) || null, [jobs, selectedId]);

    return (
        <MapContainer
            center={INDIA_CENTER}
            zoom={5}
            minZoom={2}
            scrollWheelZoom
            worldCopyJump
            style={{ height: "100%", width: "100%", background: "#0b1220" }}
        >
            <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                subdomains={["a", "b", "c", "d"]}
                attribution='&copy; OpenStreetMap &copy; CARTO'
                maxZoom={19}
            />
            <MarkerClusterGroup
                chunkedLoading
                showCoverageOnHover={false}
                maxClusterRadius={45}
                iconCreateFunction={clusterIcon}
            >
                {mapped.map((j) => (
                    <Marker
                        key={j.id}
                        position={[j.location.lat as number, j.location.lng as number]}
                        icon={markerIcon(j.source, Boolean(j.featured), j.id === selectedId)}
                        eventHandlers={{ click: () => onSelect(j.id) }}
                    />
                ))}
            </MarkerClusterGroup>
            <FlyTo job={selected} />
        </MapContainer>
    );
}
