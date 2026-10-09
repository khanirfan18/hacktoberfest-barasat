"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { ExploreCity, ExploreGym } from "@/lib/queries/gyms";
import { formatMoney } from "@/lib/format";

function FitResults({ gyms }: { gyms: ExploreGym[] }) {
  const map = useMap();
  useEffect(() => {
    const points = gyms.filter((gym): gym is ExploreGym & { lat: number; lng: number } => gym.lat !== null && gym.lng !== null);
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    map.fitBounds(points.map((gym) => [gym.lat, gym.lng]), { padding: [36, 36], maxZoom: 14 });
  }, [gyms, map]);
  return null;
}

function priceMarker(gym: ExploreGym, selected: boolean) {
  const text = gym.priceMinor === null ? "—" : formatMoney(gym.priceMinor, gym.priceCurrency);
  const tone = gym.isOpenNow && gym.nextFreeHour !== null
    ? "marker-hot"
    : gym.status === "claimed" ? "marker-bookable" : "marker-unclaimed";
  return L.divIcon({
    className: "",
    html: `<span class="price-marker ${tone}${selected ? " marker-selected" : ""}">${text}</span>`,
    iconSize: [72, 34],
    iconAnchor: [36, 17],
  });
}

export default function ExploreMap({
  city,
  gyms,
  selectedId,
  onSelect,
}: {
  city: ExploreCity;
  gyms: ExploreGym[];
  selectedId: string | null;
  onSelect: (gymId: string, activate: boolean) => void;
}) {
  const locatedGyms = gyms.filter(
    (gym): gym is ExploreGym & { lat: number; lng: number } => gym.lat !== null && gym.lng !== null,
  );
  return (
    <MapContainer
      center={[city.lat, city.lng]}
      zoom={12}
      scrollWheelZoom
      className="h-full min-h-[420px] w-full bg-[#101418]"
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        className="map-tiles"
        maxZoom={19}
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitResults gyms={gyms} />
      {locatedGyms.map((gym) => (
        <Marker
          key={gym.id}
          position={[gym.lat, gym.lng]}
          icon={priceMarker(gym, selectedId === gym.id)}
          eventHandlers={{ click: () => onSelect(gym.id, true), mouseover: () => onSelect(gym.id, false) }}
        />
      ))}
    </MapContainer>
  );
}
