# Webhook Delivery Architecture

This document describes the refactored webhook delivery system that eliminates code duplication by using common utilities.

## Architecture Overview

The webhook delivery system now follows a clean separation of concerns:

1. **Common Utilities** (`webhook-delivery-utils.ts`) - Shared HTTP delivery logic
2. **Activity Webhooks** (`webhook-delivery.ts`) - Workspace-based activity notifications
3. **OAuth Integration Webhooks** (`oauth-integration-webhook-delivery.ts`) - OAuth app integration notifications

## Common Utilities (`webhook-delivery-utils.ts`)

### Core Function: `deliverWebhook()`

Handles the common HTTP delivery logic for both webhook types:

```typescript
export async function deliverWebhook(params: WebhookDeliveryParams): Promise<{
  success: boolean;
  deliveryResults: DeliveryResult[];
  summary: { total: number; successful: number; failed: number };
}>;
```

**Features:**

- Generic payload support (works with any webhook structure)
- Configurable User-Agent strings
- HMAC signature verification with different header formats
- 30-second timeout
- Comprehensive error handling and logging
- Detailed delivery results

### Helper Function: `prepareWebhookTargets()`

Converts simple webhook configurations to the standardized target format:

```typescript
export function prepareWebhookTargets(
  webhooks: Array<{ url: string; secret?: string | null }>
): WebhookTarget[];
```

## Activity Webhooks (`webhook-delivery.ts`)

**Purpose:** Send notifications to workspace webhook configurations when activities are created.

**Payload Structure:**

```json
{
  "event": "activity.created",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "id": "activity_id",
    "text": "Activity content",
    "sourceURL": "https://source.url",
    "integrationAccount": { ... },
    "workspace": { ... }
  }
}
```

**Key Features:**

- Uses `X-Hub-Signature-256` header for HMAC verification
- Logs delivery results to `WebhookDeliveryLog` table
- Targets all active workspace webhook configurations

## OAuth Integration Webhooks (`oauth-integration-webhook-delivery.ts`)

**Purpose:** Notify OAuth applications when users connect new integrations.

**Payload Structure:**

```json
{
  "event": "integration.connected",
  "user_id": "user_uuid",
  "integration": {
    "id": "integration_account_id",
    "provider": "linear",
    "account_id": "external_account_id",
    "mcp_endpoint": "mcp://core.ai/linear/external_account_id",
    "name": "Linear",
    "icon": "https://example.com/icon.png"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Key Features:**

- Uses `X-Webhook-Secret` header for HMAC verification
- Custom User-Agent: `Echo-OAuth-Webhooks/1.0`
- Targets OAuth clients with `integration` scope and webhook URLs

## Shared Features

Both webhook types benefit from the common utilities:

### Security

- HMAC-SHA256 signature verification
- Configurable secrets per webhook target
- Proper HTTP headers for identification

### Reliability

- 30-second request timeout
- Comprehensive error handling
- Non-blocking webhook failures

### Observability

- Detailed logging at each step
- Delivery success/failure tracking
- Response status and body capture (limited)

### Performance

- Parallel webhook delivery
- Efficient target preparation
- Minimal memory footprint

## Integration Points

### Activity Webhooks

- Triggered from: `apps/webapp/app/routes/api.v1.activity.tsx`
- Function: `triggerWebhookDelivery(activityId, workspaceId)`

### OAuth Integration Webhooks

- Triggered from: `apps/webapp/app/trigger/integrations/integration-run.ts`
- Function: `triggerOAuthIntegrationWebhook(integrationAccountId, userId)`

## Benefits of This Architecture

1. **Code Reuse**: Common HTTP delivery logic eliminates duplication
2. **Maintainability**: Single place to update delivery logic
3. **Consistency**: Same headers, timeouts, and error handling across webhook types
4. **Flexibility**: Easy to add new webhook types by reusing common utilities
5. **Testing**: Easier to test common logic independently
6. **Security**: Consistent HMAC implementation across all webhook types

## Adding New Webhook Types

To add a new webhook type:

1. Create a new trigger task file (e.g., `new-webhook-delivery.ts`)
2. Define your payload structure
3. Use `deliverWebhook()` with your payload and targets
4. Add your event type to `WebhookEventType` in utils
5. Update HMAC header logic in `deliverWebhook()` if needed

This architecture provides a solid foundation for webhook delivery that can easily scale to support additional webhook types while maintaining code quality and consistency.
