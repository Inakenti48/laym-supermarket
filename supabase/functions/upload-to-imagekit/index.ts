import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { base64Image, fileName, folder } = await req.json()

    if (!base64Image) {
      return new Response(
        JSON.stringify({ error: 'No image provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const privateKey = Deno.env.get('IMAGEKIT_PRIVATE_KEY')
    const urlEndpoint = Deno.env.get('IMAGEKIT_URL_ENDPOINT')

    if (!privateKey || !urlEndpoint) {
      return new Response(
        JSON.stringify({ error: 'ImageKit not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Remove data:image/...;base64, prefix if present
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '')

    // Generate unique filename
    const uniqueFileName = fileName || `product_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`

    // Upload to ImageKit
    const formData = new FormData()
    formData.append('file', base64Data)
    formData.append('fileName', uniqueFileName)
    formData.append('folder', folder || '/products')

    const authString = btoa(`${privateKey}:`)

    const uploadResponse = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
      },
      body: formData,
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      console.error('ImageKit upload error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to upload to ImageKit', details: errorText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const result = await uploadResponse.json()

    return new Response(
      JSON.stringify({
        success: true,
        url: result.url,
        fileId: result.fileId,
        name: result.name,
        thumbnailUrl: result.thumbnailUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    console.error('Error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ error: 'Unexpected error', details: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
