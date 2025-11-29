import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const S3_ENDPOINT = Deno.env.get('S3_ENDPOINT') || '';
const S3_ACCESS_KEY = Deno.env.get('S3_ACCESS_KEY') || '';
const S3_SECRET_KEY = Deno.env.get('S3_SECRET_KEY') || '';
const S3_BUCKET = Deno.env.get('S3_BUCKET') || '';

// Generate AWS Signature V4
async function signRequest(
  method: string,
  path: string,
  region: string = 'us-east-1',
  service: string = 's3'
): Promise<Record<string, string>> {
  const encoder = new TextEncoder();
  
  const algorithm = 'AWS4-HMAC-SHA256';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  
  // Parse endpoint to get host
  const endpointUrl = new URL(S3_ENDPOINT);
  const host = endpointUrl.host;
  
  // Canonical headers
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  
  // Canonical request
  const canonicalRequest = [
    method,
    path,
    '', // query string
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD'
  ].join('\n');
  
  // String to sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    canonicalRequestHash
  ].join('\n');
  
  // Signing key
  const kDate = await hmacSha256Raw(encoder.encode('AWS4' + S3_SECRET_KEY), encoder.encode(dateStamp));
  const kRegion = await hmacSha256Raw(kDate, encoder.encode(region));
  const kService = await hmacSha256Raw(kRegion, encoder.encode(service));
  const kSigning = await hmacSha256Raw(kService, encoder.encode('aws4_request'));
  
  // Signature
  const signature = await hmacSha256Hex(kSigning, encoder.encode(stringToSign));
  
  const authorization = `${algorithm} Credential=${S3_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  return {
    'Host': host,
    'X-Amz-Date': amzDate,
    'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
    'Authorization': authorization,
  };
}

async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256Raw(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data.buffer as ArrayBuffer);
  return new Uint8Array(signature);
}

async function hmacSha256Hex(key: Uint8Array, data: Uint8Array): Promise<string> {
  const result = await hmacSha256Raw(key, data);
  return Array.from(result)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, fileName, fileData, contentType, folder } = await req.json();
    
    console.log(`📤 S3 Action: ${action}, File: ${fileName}`);

    if (action === 'test_connection') {
      // Test S3 connection by listing bucket
      const path = `/${S3_BUCKET}/`;
      const authHeaders = await signRequest('GET', path);
      
      const response = await fetch(`${S3_ENDPOINT}${path}`, {
        method: 'GET',
        headers: authHeaders,
      });
      
      if (response.ok) {
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'S3 connection successful',
          bucket: S3_BUCKET
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        const errorText = await response.text();
        throw new Error(`S3 error: ${response.status} - ${errorText}`);
      }
    }

    if (action === 'upload') {
      if (!fileName || !fileData) {
        throw new Error('fileName and fileData are required');
      }

      // Decode base64 file data
      const binaryData = Uint8Array.from(atob(fileData), c => c.charCodeAt(0));
      
      // Generate file path - используем имя файла как есть (для штрихкодов)
      const folderPath = folder || 'uploads';
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `/${S3_BUCKET}/${folderPath}/${safeName}`;
      
      const authHeaders = await signRequest('PUT', filePath);
      
      const response = await fetch(`${S3_ENDPOINT}${filePath}`, {
        method: 'PUT',
        headers: {
          ...authHeaders,
          'Content-Type': contentType || 'application/octet-stream',
        },
        body: binaryData,
      });

      if (response.ok) {
        const fileUrl = `${S3_ENDPOINT}${filePath}`;
        console.log(`✅ File uploaded: ${fileUrl}`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          url: fileUrl,
          path: filePath,
          message: 'File uploaded successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }
    }

    if (action === 'delete') {
      if (!fileName) {
        throw new Error('fileName (path) is required');
      }

      const filePath = fileName.startsWith('/') ? fileName : `/${S3_BUCKET}/${fileName}`;
      const authHeaders = await signRequest('DELETE', filePath);
      
      const response = await fetch(`${S3_ENDPOINT}${filePath}`, {
        method: 'DELETE',
        headers: authHeaders,
      });

      if (response.ok || response.status === 204) {
        console.log(`🗑️ File deleted: ${filePath}`);
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'File deleted successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        const errorText = await response.text();
        throw new Error(`Delete failed: ${response.status} - ${errorText}`);
      }
    }

    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Unknown action. Use: test_connection, upload, delete' 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const error = err as Error;
    console.error('❌ S3 Error:', error.message);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
