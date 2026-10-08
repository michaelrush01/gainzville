// Turn a US ZIP code into a map center (free Zippopotam.us lookup, no key).
export async function GET(request: Request) {
  const zip = new URL(request.url).searchParams.get("zip") ?? "";
  if (!/^\d{5}$/.test(zip)) return Response.json({ error: "Enter a 5-digit ZIP." }, { status: 400 });

  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return Response.json({ error: "We couldn't find that ZIP." }, { status: 404 });
    const data = await res.json();
    const place = data.places?.[0];
    return Response.json(
      {
        lat: Number(place.latitude),
        lng: Number(place.longitude),
        place: `${place["place name"]}, ${place["state abbreviation"]}`,
      },
      { headers: { "Cache-Control": "public, max-age=604800" } },
    );
  } catch {
    return Response.json({ error: "Location lookup is busy. Try again." }, { status: 502 });
  }
}
