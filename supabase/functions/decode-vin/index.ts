const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NHTSAResult {
  Variable: string;
  Value: string | null;
  ValueId: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { vin } = await req.json();

    if (!vin || typeof vin !== "string" || vin.length !== 17) {
      return new Response(
        JSON.stringify({ error: "VIN must be exactly 17 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
    const response = await fetch(url);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to reach NHTSA API" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const results = data.Results?.[0];

    if (!results || results.ErrorCode !== "0") {
      const errorText = results?.ErrorText || "Unable to decode VIN";

      // If we still got useful data, return it with a warning
      if (results?.Make || results?.ModelYear) {
        const decoded = {
          year: results.ModelYear ? parseInt(results.ModelYear) : null,
          make: results.Make || null,
          model: results.Model || null,
          bodyClass: results.BodyClass || null,
          vehicleType: results.VehicleType || null,
          driveType: results.DriveType || null,
          fuelType: results.FuelTypePrimary || null,
          engineCylinders: results.EngineCylinders || null,
          displacementL: results.DisplacementL || null,
          gvwr: results.GVWR || null,
          warning: errorText,
        };
        return new Response(JSON.stringify(decoded), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ error: `Could not decode VIN: ${errorText}` }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const decoded = {
      year: results.ModelYear ? parseInt(results.ModelYear) : null,
      make: results.Make || null,
      model: results.Model || null,
      bodyClass: results.BodyClass || null,
      vehicleType: results.VehicleType || null,
      driveType: results.DriveType || null,
      fuelType: results.FuelTypePrimary || null,
      engineCylinders: results.EngineCylinders || null,
      displacementL: results.DisplacementL || null,
      gvwr: results.GVWR || null,
    };

    return new Response(JSON.stringify(decoded), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
