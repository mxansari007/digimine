import { useEffect, useMemo, useRef, useState } from "react";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { JobOpening } from "@/lib/api";
import { sourceColor } from "./sourceMeta";

// Self-contained Leaflet map (same free CARTO dark tiles + markercluster as the
// web). Synchronous <script src> tags guarantee Leaflet + markercluster are
// loaded before window.setJobs is defined and the "ready" message is posted.
const HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
<style>
html,body,#map{height:100%;margin:0;padding:0;background:#0b1220}
.leaflet-control-attribution{display:none}
/* Dark-theme the zoom control to match the app's intel-console palette. */
.leaflet-control-zoom{border:none!important;box-shadow:0 2px 12px rgba(0,0,0,0.55)!important;border-radius:10px!important;overflow:hidden}
.leaflet-control-zoom a{background:#0f1b2d!important;color:#cbd5e1!important;border-color:rgba(255,255,255,0.12)!important;width:34px;height:34px;line-height:34px;font-size:18px}
.leaflet-control-zoom a:hover{background:#16243a!important;color:#5eead4!important}
.leaflet-bar a.leaflet-disabled{background:#0b1220!important;color:#475569!important}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<script>
  function post(o){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); } }
  var map = L.map('map', { attributionControl:false, zoomControl:true }).setView([22.97,78.66], 4);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains:'abcd', maxZoom:19 }).addTo(map);
  var cluster = L.markerClusterGroup({
    maxClusterRadius: 45,
    showCoverageOnHover: false,
    iconCreateFunction: function(c){
      var n = c.getChildCount();
      var s = n < 10 ? 36 : n < 50 ? 44 : 54;
      return L.divIcon({ className:'', iconSize: L.point(s,s,true),
        html: '<div style="width:'+s+'px;height:'+s+'px;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:rgba(20,184,166,0.16);border:1.5px solid rgba(45,212,191,0.65);color:#5eead4;font-weight:700;font-size:13px;box-shadow:0 0 22px rgba(45,212,191,0.35)">'+n+'</div>' });
    }
  });
  map.addLayer(cluster);
  window.setJobs = function(jobs){
    cluster.clearLayers();
    var ms = [];
    for (var i=0;i<jobs.length;i++){
      (function(j){
        var color = j.color || '#2dd4bf';
        var size = j.featured ? 16 : 13;
        var icon = L.divIcon({ className:'', iconSize:[size,size], iconAnchor:[size/2,size/2],
          html: '<span style="display:block;width:'+size+'px;height:'+size+'px;border-radius:9999px;background:'+color+';box-shadow:0 0 0 3px '+color+'33,0 0 10px '+color+'aa;border:1.5px solid #0b1220"></span>' });
        var m = L.marker([j.lat, j.lng], { icon: icon });
        m.on('click', function(){ map.panTo([j.lat, j.lng]); post({ type:'select', id:j.id }); });
        ms.push(m);
      })(jobs[i]);
    }
    cluster.addLayers(ms);
  };
  post({ type:'ready' });
</script>
</body>
</html>`;

export default function JobMapWeb({
  jobs,
  onSelect,
}: {
  jobs: JobOpening[];
  onSelect: (id: string) => void;
}) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  const markers = useMemo(
    () =>
      jobs
        .filter((j) => j.location.lat != null && j.location.lng != null)
        .map((j) => ({
          id: j.id,
          lat: j.location.lat as number,
          lng: j.location.lng as number,
          color: sourceColor(j.source),
          featured: Boolean(j.featured),
        })),
    [jobs]
  );

  // Push markers whenever the map is ready and the filtered set changes.
  useEffect(() => {
    if (ready && ref.current) {
      ref.current.injectJavaScript(`window.setJobs(${JSON.stringify(markers)}); true;`);
    }
  }, [ready, markers]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg?.type === "ready") setReady(true);
      else if (msg?.type === "select" && msg.id) onSelect(String(msg.id));
    } catch {
      /* ignore malformed bridge messages */
    }
  };

  return (
    <WebView
      ref={ref}
      originWhitelist={["*"]}
      source={{ html: HTML }}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      androidLayerType="hardware"
      style={{ flex: 1, backgroundColor: "#0b1220" }}
    />
  );
}
