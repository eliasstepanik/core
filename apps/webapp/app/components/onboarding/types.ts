export enum Provider {
  CLAUDE_CODE = "claude-code",
  CLAUDE = "claude",
  CURSOR = "cursor",
  KILO_CODE = "kilo-code",
  VSCODE = "vscode",
  ZED = "zed",
}

export enum OnboardingStep {
  PROVIDER_SELECTION = "provider_selection",
  FIRST_INGESTION = "first_ingestion",
  VERIFICATION = "verification",
  COMPLETE = "complete",
}

export interface ProviderConfig {
  id: Provider;
  name: string;
  description: string;
  docsUrl: string;
  icon: string;
}

export interface OnboardingState {
  currentStep: OnboardingStep;
  selectedProvider?: Provider;
  isConnected: boolean;
  ingestionStatus: "idle" | "waiting" | "processing" | "complete" | "error";
  verificationResult?: string;
  error?: string;
}
