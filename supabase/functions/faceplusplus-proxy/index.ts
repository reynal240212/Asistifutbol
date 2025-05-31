import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

console.log("faceplusplus-proxy function initialized");

serve(async (req: Request) => {
  // Initialize Supabase client
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "" // Use service_role for admin tasks
  );

  // Handle preflight OPTIONS request for CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { image_base64 } = await req.json();
    if (!image_base64) {
      return new Response(JSON.stringify({ error: "Missing image_base64 parameter" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const apiKey = Deno.env.get("FACEPLUSPLUS_API_KEY");
    const apiSecret = Deno.env.get("FACEPLUSPLUS_API_SECRET");

    if (!apiKey || !apiSecret) {
      console.error("Face++ API key or secret not set in environment variables.");
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const formData = new FormData();
    formData.append("api_key", apiKey);
    formData.append("api_secret", apiSecret);
    formData.append("image_base64", image_base64);
    formData.append("return_attributes", "gender,age");

    console.log("Sending request to Face++ API");
    const response = await fetch("https://api-us.faceplusplus.com/facepp/v3/detect", {
      method: "POST",
      body: formData,
    });

    const facePlusPlusData = await response.json();
    console.log("Received response from Face++ API:", facePlusPlusData);

    if (response.ok && facePlusPlusData.faces && facePlusPlusData.faces.length > 0) {
      // Face detected, now save to Supabase
      try {
        const { error: dbError } = await supabaseAdmin
          .from("asistencias")
          .insert({
            // Ensure these column names match your 'asistencias' table
            fecha: new Date().toISOString(),
            asistio: true,
            tipo_evento: "Reconocimiento Facial (Backend)",
            // jugador_id: null, // Explicitly set if needed, or omit if default is null
            // metadata_faceplusplus: facePlusPlusData.faces[0].attributes // Optional: store raw attributes
          });

        if (dbError) {
          console.error("Error saving attendance to Supabase:", dbError);
          // Decide if you want to return an error to the client here
          // For now, we'll just log it and return the Face++ data
        } else {
          console.log("Attendance successfully saved to Supabase.");
        }
      } catch (e) {
        console.error("Exception during Supabase insert:", e);
      }

      // Return Face++ data to client
      return new Response(JSON.stringify(facePlusPlusData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200, // Or response.status from Face++
      });

    } else {
      // No face detected or Face++ error, return original Face++ response
      return new Response(JSON.stringify(facePlusPlusData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: response.status, // Or a specific error status
      });
    }

  } catch (error) {
    console.error("Error in Edge Function:", error.message, error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
