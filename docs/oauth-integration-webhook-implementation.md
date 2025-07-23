# OAuth Integration Webhook Implementation

This document describes the implementation of webhook notifications for OAuth applications when users connect new integrations, following the existing trigger-based architecture.

## Architecture

The implementation follows the established pattern used in the Echo system:

- **Integration Creation**: Happens in `integration-run` trigger
- **Webhook Delivery**: Uses dedicated trigger task for asynchronous processing
- **Error Handling**: Non-blocking - webhook failures don't affect integration creation

## Implementation Components

### 1. OAuth Integration Webhook Delivery Task

**File**: `apps/webapp/app/trigger/webhooks/oauth-integration-webhook-delivery.ts`

This is a dedicated trigger task that handles webhook delivery to OAuth applications:

```typescript
export const oauthIntegrationWebhookTask = task({
  id: "oauth-integration-webhook-delivery",
  queue: oauthIntegrationWebhookQueue,
  run: async (payload: OAuthIntegrationWebhookPayload) => {
    // Implementation
  },
});
```

**Key Features**:

- Finds OAuth clients with `integration` scope for the user
- Sends webhook notifications with integration details
- Includes HMAC signature verification
- Provides detailed delivery status tracking
- Non-blocking error handling

### 2. Integration into Integration-Run Trigger

**File**: `apps/webapp/app/trigger/integrations/integration-run.ts`

Modified the `handleAccountMessage` function to trigger webhook notifications:

```typescript
async function handleAccountMessage(...) {
  // Create integration account
  const integrationAccount = await createIntegrationAccount({...});

  // Trigger OAuth integration webhook notifications
  try {
    await triggerOAuthIntegrationWebhook(integrationAccount.id, userId);
  } catch (error) {
    // Log error but don't fail integration creation
  }

  return integrationAccount;
}
```

**Integration Points**:

- Triggered after successful integration account creation
- Works for all integration types (OAuth, API key, MCP)
- Maintains existing integration creation flow

## Webhook Flow

### 1. Integration Connection

When a user connects a new integration:

1. Integration runs through `IntegrationEventType.SETUP`
2. CLI returns "account" message
3. `handleAccountMessage` creates integration account
4. `triggerOAuthIntegrationWebhook` is called
5. Webhook delivery task is queued

### 2. Webhook Delivery

The webhook delivery task:

1. Queries OAuth clients with:
   - `integration` scope in `allowedScopes`
   - Active `OAuthIntegrationGrant` for the user
   - Configured `webhookUrl`
2. Sends HTTP POST to each webhook URL
3. Logs delivery results

### 3. Webhook Payload

```json
{
  "event": "integration.connected",
  "user_id": "user_uuid",
  "integration": {
    "id": "integration_account_uuid",
    "provider": "linear",
    "account_id": "external_account_id",
    "mcp_endpoint": "mcp://core.ai/linear/external_account_id",
    "name": "Linear",
    "icon": "https://example.com/linear-icon.png"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Security Features

### HMAC Signature

If OAuth client has `webhookSecret` configured:

```typescript
const signature = crypto
  .createHmac("sha256", client.webhookSecret)
  .update(payloadString)
  .digest("hex");
headers["X-Webhook-Secret"] = signature;
```

### Headers

- `Content-Type: application/json`
- `User-Agent: Echo-OAuth-Webhooks/1.0`
- `X-Webhook-Delivery: ${deliveryId}`
- `X-Webhook-Event: integration.connected`
- `X-Webhook-Secret: ${signature}` (if secret configured)

## Error Handling

### Non-Blocking Design

- Webhook delivery failures do NOT affect integration creation
- Errors are logged but don't throw exceptions
- Integration process continues normally

### Retry Strategy

Currently, the system uses Trigger.dev's built-in retry mechanism:

- Failed webhook deliveries will be retried automatically
- Exponential backoff for temporary failures
- Dead letter queue for permanent failures

### Logging

Comprehensive logging includes:

- Integration account details
- OAuth client information
- HTTP response status and body
- Error messages and stack traces
- Delivery success/failure counts

## Database Requirements

The implementation requires these existing database relationships:

### OAuthClient

- `webhookUrl`: Target URL for notifications
- `webhookSecret`: Optional HMAC secret
- `allowedScopes`: Must include "integration"

### OAuthIntegrationGrant

- Links OAuth clients to users
- `isActive`: Must be true for notifications
- `userId`: Target user for the integration

### IntegrationAccount

- Created during integration setup
- Includes `integrationDefinition` relationship
- Contains provider-specific configuration

## Testing

To test the webhook delivery:

1. **Create OAuth Client** with integration scope:

```sql
UPDATE "OAuthClient"
SET "allowedScopes" = 'profile,email,openid,integration',
    "webhookUrl" = 'https://your-webhook-endpoint.com/webhooks'
WHERE "clientId" = 'your-client-id';
```

2. **Grant Integration Access** through OAuth flow with `integration` scope

3. **Connect Integration** (Linear, Slack, etc.) - webhooks will be triggered automatically

4. **Monitor Logs** for delivery status and any errors

## Advantages of This Approach

1. **Follows Existing Patterns**: Uses the same trigger-based architecture as other webhook systems
2. **Scalable**: Leverages Trigger.dev's queue system for handling high volumes
3. **Reliable**: Built-in retry and error handling
4. **Non-Blocking**: Integration creation is never blocked by webhook issues
5. **Comprehensive**: Works with all integration types and OAuth flows
6. **Secure**: Includes HMAC signature verification and proper headers
7. **Observable**: Detailed logging for monitoring and debugging

This implementation ensures that OAuth applications are immediately notified when users connect new integrations, while maintaining the reliability and scalability of the existing system architecture.
