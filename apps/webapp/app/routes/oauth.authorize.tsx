import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Form, useLoaderData, useSearchParams } from "@remix-run/react";
import { getUser } from "~/services/session.server";
import { oauth2Service, OAuth2Errors, type OAuth2AuthorizeRequest } from "~/services/oauth2.server";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Check if user is authenticated
  const user = await getUser(request);
  
  if (!user) {
    // Redirect to login with return URL
    const url = new URL(request.url);
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", url.pathname + url.search);
    return redirect(loginUrl.toString());
  }

  const url = new URL(request.url);
  const params: OAuth2AuthorizeRequest = {
    client_id: url.searchParams.get("client_id") || "",
    redirect_uri: url.searchParams.get("redirect_uri") || "",
    response_type: url.searchParams.get("response_type") || "",
    scope: url.searchParams.get("scope") || undefined,
    state: url.searchParams.get("state") || undefined,
    code_challenge: url.searchParams.get("code_challenge") || undefined,
    code_challenge_method: url.searchParams.get("code_challenge_method") || undefined,
  };

  // Validate required parameters
  if (!params.client_id || !params.redirect_uri || !params.response_type) {
    return redirect(`${params.redirect_uri}?error=${OAuth2Errors.INVALID_REQUEST}&error_description=Missing required parameters${params.state ? `&state=${params.state}` : ""}`);
  }

  // Only support authorization code flow
  if (params.response_type !== "code") {
    return redirect(`${params.redirect_uri}?error=${OAuth2Errors.UNSUPPORTED_RESPONSE_TYPE}&error_description=Only authorization code flow is supported${params.state ? `&state=${params.state}` : ""}`);
  }

  try {
    // Validate client
    const client = await oauth2Service.validateClient(params.client_id);
    
    // Validate redirect URI
    if (!oauth2Service.validateRedirectUri(client, params.redirect_uri)) {
      return redirect(`${params.redirect_uri}?error=${OAuth2Errors.INVALID_REQUEST}&error_description=Invalid redirect URI${params.state ? `&state=${params.state}` : ""}`);
    }

    return {
      user,
      client,
      params,
    };
  } catch (error) {
    return redirect(`${params.redirect_uri}?error=${OAuth2Errors.INVALID_CLIENT}&error_description=Invalid client${params.state ? `&state=${params.state}` : ""}`);
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  
  if (!user) {
    return redirect("/login");
  }

  const formData = await request.formData();
  const action = formData.get("action");
  
  const params: OAuth2AuthorizeRequest = {
    client_id: formData.get("client_id") as string,
    redirect_uri: formData.get("redirect_uri") as string,
    response_type: formData.get("response_type") as string,
    scope: formData.get("scope") as string || undefined,
    state: formData.get("state") as string || undefined,
    code_challenge: formData.get("code_challenge") as string || undefined,
    code_challenge_method: formData.get("code_challenge_method") as string || undefined,
  };

  if (action === "deny") {
    return redirect(`${params.redirect_uri}?error=${OAuth2Errors.ACCESS_DENIED}&error_description=User denied access${params.state ? `&state=${params.state}` : ""}`);
  }

  if (action === "allow") {
    try {
      // Validate client again
      const client = await oauth2Service.validateClient(params.client_id);
      
      if (!oauth2Service.validateRedirectUri(client, params.redirect_uri)) {
        return redirect(`${params.redirect_uri}?error=${OAuth2Errors.INVALID_REQUEST}&error_description=Invalid redirect URI${params.state ? `&state=${params.state}` : ""}`);
      }

      // Create authorization code
      const authCode = await oauth2Service.createAuthorizationCode({
        clientId: params.client_id,
        userId: user.id,
        redirectUri: params.redirect_uri,
        scope: params.scope,
        state: params.state,
        codeChallenge: params.code_challenge,
        codeChallengeMethod: params.code_challenge_method,
      });
      // Redirect back to client with authorization code
      const redirectUrl = new URL(params.redirect_uri);
      redirectUrl.searchParams.set("code", authCode);
      if (params.state) {
        redirectUrl.searchParams.set("state", params.state);
      }

      return redirect(redirectUrl.toString());
    } catch (error) {
      return redirect(`${params.redirect_uri}?error=${OAuth2Errors.SERVER_ERROR}&error_description=Failed to create authorization code${params.state ? `&state=${params.state}` : ""}`);
    }
  }

  return redirect(`${params.redirect_uri}?error=${OAuth2Errors.INVALID_REQUEST}&error_description=Invalid action${params.state ? `&state=${params.state}` : ""}`);
};

export default function OAuthAuthorize() {
  const { user, client, params } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authorize Application</CardTitle>
          <CardDescription>
            <strong>{client.name}</strong> wants to access your Echo account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              {client.logoUrl && (
                <img 
                  src={client.logoUrl} 
                  alt={client.name}
                  className="w-8 h-8 rounded"
                />
              )}
              <div>
                <p className="font-medium">{client.name}</p>
                {client.description && (
                  <p className="text-sm text-gray-600">{client.description}</p>
                )}
              </div>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-sm font-medium mb-2">This application will be able to:</p>
              <ul className="text-sm text-gray-600 space-y-1">
                {params.scope ? (
                  params.scope.split(' ').map((scope, index) => (
                    <li key={index}>• {scope === 'read' ? 'Read your profile information' : scope}</li>
                  ))
                ) : (
                  <li>• Read your profile information</li>
                )}
              </ul>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Signed in as:</strong> {user.email}
              </p>
            </div>

            <Form method="post" className="space-y-3">
              <input type="hidden" name="client_id" value={params.client_id} />
              <input type="hidden" name="redirect_uri" value={params.redirect_uri} />
              <input type="hidden" name="response_type" value={params.response_type} />
              {params.scope && <input type="hidden" name="scope" value={params.scope} />}
              {params.state && <input type="hidden" name="state" value={params.state} />}
              {params.code_challenge && <input type="hidden" name="code_challenge" value={params.code_challenge} />}
              {params.code_challenge_method && <input type="hidden" name="code_challenge_method" value={params.code_challenge_method} />}
              
              <div className="flex space-x-3">
                <Button 
                  type="submit" 
                  name="action" 
                  value="allow"
                  className="flex-1"
                >
                  Allow Access
                </Button>
                <Button 
                  type="submit" 
                  name="action" 
                  value="deny"
                  variant="outline"
                  className="flex-1"
                >
                  Deny
                </Button>
              </div>
            </Form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}