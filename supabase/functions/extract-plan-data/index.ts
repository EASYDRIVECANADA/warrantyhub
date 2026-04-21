import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 20) {
      return new Response(JSON.stringify({ error: "Please provide at least 20 characters of plan text." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert at extracting warranty plan data from text documents. Given a pasted plan document, extract structured data and return it as a JSON object.

Return a JSON object with this structure:
{
  "name": "plan name",
  "type": "warranty" or "tire_rim" or "gap" or "theft",
  "description": "brief description",
  "group": "plan family/group name if applicable",
  "maxAge": "max vehicle age in years as string",
  "maxMileage": "max mileage as string number",
  "deductible": "deductible amount as string",
  "perClaim": "per claim max as string or empty",
  "coverageCategories": [{"name": "category name", "parts": ["part1", "part2"]}],
  "pricingRows": [{"term": "12 months", "mileageBracket": "0-80,000 km", "vehicleClass": "Class 1", "dealerCost": 895, "suggestedRetail": 1295}],
  "benefits": [{"name": "benefit name", "included": true}],
  "termsSections": [{"title": "section title", "content": "section content"}],
  "exclusions": "one exclusion per line",
  "waitingPeriod": "waiting period text",
  "coverageTerritory": "territory text",
  "importantNotes": "one note per line"
}

Extract as much information as possible. For missing fields, use reasonable defaults. Always return valid JSON.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extract the warranty plan data from this text:\n\n${text.slice(0, 15000)}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_plan",
              description: "Extract structured warranty plan data from text",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: { type: "string", enum: ["warranty", "tire_rim", "gap", "theft"] },
                  description: { type: "string" },
                  group: { type: "string" },
                  maxAge: { type: "string" },
                  maxMileage: { type: "string" },
                  deductible: { type: "string" },
                  perClaim: { type: "string" },
                  coverageCategories: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        parts: { type: "array", items: { type: "string" } },
                      },
                      required: ["name", "parts"],
                    },
                  },
                  pricingRows: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        term: { type: "string" },
                        mileageBracket: { type: "string" },
                        vehicleClass: { type: "string" },
                        dealerCost: { type: "number" },
                        suggestedRetail: { type: "number" },
                      },
                      required: ["term", "mileageBracket", "vehicleClass", "dealerCost", "suggestedRetail"],
                    },
                  },
                  benefits: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        included: { type: "boolean" },
                      },
                      required: ["name", "included"],
                    },
                  },
                  termsSections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        content: { type: "string" },
                      },
                      required: ["title", "content"],
                    },
                  },
                  exclusions: { type: "string" },
                  waitingPeriod: { type: "string" },
                  coverageTerritory: { type: "string" },
                  importantNotes: { type: "string" },
                },
                required: ["name", "type"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_plan" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI extraction failed");
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("No structured data returned from AI");
    }

    const product = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ product }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-plan-data error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
