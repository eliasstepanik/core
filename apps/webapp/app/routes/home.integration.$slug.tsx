import React, { useMemo, useState, useCallback } from "react";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { requireUserId, requireWorkpace } from "~/services/session.server";
import { getIntegrationDefinitions } from "~/services/integrationDefinition.server";
import { getIntegrationAccounts } from "~/services/integrationAccount.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { getIcon, type IconType } from "~/components/icon-utils";
import { Checkbox } from "~/components/ui/checkbox";
import { MCPAuthSection } from "~/components/integrations/mcp-auth-section";
import { ConnectedAccountSection } from "~/components/integrations/connected-account-section";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const workspace = await requireWorkpace(request);
  const { slug } = params;

  const [integrationDefinitions, integrationAccounts] = await Promise.all([
    getIntegrationDefinitions(workspace.id),
    getIntegrationAccounts(userId),
  ]);

  const integration = integrationDefinitions.find(
    (def) => def.slug === slug || def.id === slug,
  );

  if (!integration) {
    throw new Response("Integration not found", { status: 404 });
  }

  return json({
    integration,
    integrationAccounts,
    userId,
  });
}

function parseSpec(spec: any) {
  if (!spec) return {};
  if (typeof spec === "string") {
    try {
      return JSON.parse(spec);
    } catch {
      return {};
    }
  }
  return spec;
}

export default function IntegrationDetail() {
  const { integration, integrationAccounts } = useLoaderData<typeof loader>();
  const [apiKey, setApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showApiKeyForm, setShowApiKeyForm] = useState(false);

  const apiKeyFetcher = useFetcher();
  const oauthFetcher = useFetcher<{ redirectURL: string }>();

  const activeAccount = useMemo(
    () =>
      integrationAccounts.find(
        (acc) => acc.integrationDefinitionId === integration.id && acc.isActive,
      ),
    [integrationAccounts, integration.id],
  );

  const specData = useMemo(
    () => parseSpec(integration.spec),
    [integration.spec],
  );
  const hasApiKey = !!specData?.auth?.api_key;
  const hasOAuth2 = !!specData?.auth?.OAuth2;
  const hasMCPAuth = !!specData?.mcpAuth;
  const Component = getIcon(integration.icon as IconType);

  const handleApiKeyConnect = useCallback(() => {
    if (!apiKey.trim()) return;

    setIsLoading(true);
    apiKeyFetcher.submit(
      {
        integrationDefinitionId: integration.id,
        apiKey,
      },
      {
        method: "post",
        action: "/api/v1/integration_account",
        encType: "application/json",
      },
    );
  }, [integration.id, apiKey, apiKeyFetcher]);

  const handleOAuthConnect = useCallback(() => {
    setIsConnecting(true);
    oauthFetcher.submit(
      {
        integrationDefinitionId: integration.id,
        redirectURL: window.location.href,
      },
      {
        method: "post",
        action: "/api/v1/oauth",
        encType: "application/json",
      },
    );
  }, [integration.id, oauthFetcher]);

  // Watch for fetcher completion
  React.useEffect(() => {
    if (apiKeyFetcher.state === "idle" && isLoading) {
      if (apiKeyFetcher.data !== undefined) {
        window.location.reload();
      }
    }
  }, [apiKeyFetcher.state, apiKeyFetcher.data, isLoading]);

  React.useEffect(() => {
    if (oauthFetcher.state === "idle" && isConnecting) {
      if (oauthFetcher.data?.redirectURL) {
        window.location.href = oauthFetcher.data.redirectURL;
      } else {
        setIsConnecting(false);
      }
    }
  }, [oauthFetcher.state, oauthFetcher.data, isConnecting]);

  return (
    <div className="home flex h-full flex-col overflow-y-auto p-4 px-5">
      {/* Integration Details */}
      <div className="mx-auto w-2xl space-y-6">
        <Card>
          <CardHeader className="bg-background-2">
            <div className="flex items-start gap-4">
              <div className="bg-grayAlpha-100 flex h-12 w-12 items-center justify-center rounded">
                <Component size={24} />
              </div>
              <div className="-mt-1 flex-1">
                <CardTitle className="text-2xl">{integration.name}</CardTitle>
                <CardDescription className="text-base">
                  {integration.description || `Connect to ${integration.name}`}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="bg-background-2 p-4">
            {/* Authentication Methods */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Authentication Methods</h3>
              <div className="space-y-2">
                {hasApiKey && (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-2 text-sm">
                      <Checkbox checked /> API Key authentication
                    </span>
                  </div>
                )}
                {hasOAuth2 && (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-2 text-sm">
                      <Checkbox checked />
                      OAuth 2.0 authentication
                    </span>
                  </div>
                )}
                {!hasApiKey && !hasOAuth2 && !hasMCPAuth && (
                  <div className="text-muted-foreground text-sm">
                    No authentication method specified
                  </div>
                )}
              </div>
            </div>

            {/* Connect Section */}
            {!activeAccount && (hasApiKey || hasOAuth2) && (
              <div className="mt-6 space-y-4">
                <h3 className="text-lg font-medium">
                  Connect to {integration.name}
                </h3>

                {/* API Key Authentication */}
                {hasApiKey && (
                  <div className="bg-background-3 space-y-4 rounded-lg p-4">
                    <h4 className="font-medium">API Key Authentication</h4>
                    {!showApiKeyForm ? (
                      <Button
                        variant="secondary"
                        onClick={() => setShowApiKeyForm(true)}
                        className="w-full"
                      >
                        Connect with API Key
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <label
                            htmlFor="apiKey"
                            className="text-sm font-medium"
                          >
                            {specData?.auth?.api_key?.label || "API Key"}
                          </label>
                          <Input
                            id="apiKey"
                            placeholder="Enter your API key"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                          />
                          {specData?.auth?.api_key?.description && (
                            <p className="text-muted-foreground text-xs">
                              {specData.auth.api_key.description}
                            </p>
                          )}
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setShowApiKeyForm(false);
                              setApiKey("");
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="default"
                            disabled={isLoading || !apiKey.trim()}
                            onClick={handleApiKeyConnect}
                          >
                            {isLoading || apiKeyFetcher.state === "submitting"
                              ? "Connecting..."
                              : "Connect"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* OAuth Authentication */}
                {hasOAuth2 && (
                  <div className="bg-background-3 rounded-lg p-4">
                    <h4 className="mb-3 font-medium">
                      OAuth 2.0 Authentication
                    </h4>
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      disabled={
                        isConnecting || oauthFetcher.state === "submitting"
                      }
                      onClick={handleOAuthConnect}
                      className="w-full"
                    >
                      {isConnecting || oauthFetcher.state === "submitting"
                        ? "Connecting..."
                        : `Connect to ${integration.name}`}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Connected Account Info */}
            <ConnectedAccountSection activeAccount={activeAccount} />

            {/* MCP Authentication Section */}
            <MCPAuthSection
              integration={integration}
              activeAccount={activeAccount as any}
              hasMCPAuth={hasMCPAuth}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
