import { Check, ExternalLink } from "lucide-react";
import { Button } from "../ui";
import { PROVIDER_CONFIGS } from "./provider-config";
import { type Provider } from "./types";
import { getIconForAuthorise } from "../icon-utils";

interface ProviderSelectionStepProps {
  selectedProvider?: Provider;
  onSelectProvider: (provider: Provider) => void;
  onContinue: () => void;
}

export function ProviderSelectionStep({
  selectedProvider,
  onSelectProvider,
  onContinue,
}: ProviderSelectionStepProps) {
  const providers = Object.values(PROVIDER_CONFIGS);

  return (
    <div className="space-y-2">
      <div>
        <h2 className="mb-2 text-xl font-semibold">Choose Your Provider</h2>
        <p className="text-muted-foreground text-sm">
          Select the application you'll use to connect with Core
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => {
          const isSelected = selectedProvider === provider.id;
          return (
            <Button
              key={provider.id}
              variant="outline"
              onClick={() => onSelectProvider(provider.id)}
              size="2xl"
              className={`relative flex flex-col items-start justify-center gap-1 rounded-lg border-1 border-gray-300 p-4 text-left transition-all ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "hover:border-primary/50 border-gray-300"
              }`}
            >
              <div className="flex h-full items-center gap-2">
                {getIconForAuthorise(provider.icon, 20)}
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{provider.name}</h3>
                </div>
              </div>
            </Button>
          );
        })}
      </div>

      {selectedProvider && (
        <div className="bg-grayAlpha-100 space-y-4 rounded-lg p-4">
          <div className="space-y-3">
            <h3 className="font-medium">Next Steps</h3>
            <p className="text-muted-foreground text-sm">
              Follow our setup guide to connect{" "}
              {PROVIDER_CONFIGS[selectedProvider].name} with Core. Once you've
              completed the setup, come back here to continue.
            </p>
            <a
              href={PROVIDER_CONFIGS[selectedProvider].docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
            >
              Open Setup Guide
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={onContinue}
          disabled={!selectedProvider}
          size="lg"
          variant="secondary"
        >
          Continue to Setup
        </Button>
      </div>
    </div>
  );
}
