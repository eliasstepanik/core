import type { Prisma, User } from "@core/database";
import type { GoogleProfile } from "@coji/remix-auth-google";
import { prisma } from "~/db.server";
import { env } from "~/env.server";
import { runQuery } from "~/lib/neo4j.server";
export type { User } from "@core/database";

type FindOrCreateMagicLink = {
  authenticationMethod: "MAGIC_LINK";
  email: string;
};

type FindOrCreateGoogle = {
  authenticationMethod: "GOOGLE";
  email: User["email"];
  authenticationProfile: GoogleProfile;
  authenticationExtraParams: Record<string, unknown>;
};

type FindOrCreateUser = FindOrCreateMagicLink | FindOrCreateGoogle;

type LoggedInUser = {
  user: User;
  isNewUser: boolean;
};

export async function findOrCreateUser(
  input: FindOrCreateUser,
): Promise<LoggedInUser> {
  switch (input.authenticationMethod) {
    case "GOOGLE": {
      return findOrCreateGoogleUser(input);
    }
    case "MAGIC_LINK": {
      return findOrCreateMagicLinkUser(input);
    }
  }
}

export async function findOrCreateMagicLinkUser(
  input: FindOrCreateMagicLink,
): Promise<LoggedInUser> {
  if (
    env.WHITELISTED_EMAILS &&
    !new RegExp(env.WHITELISTED_EMAILS).test(input.email)
  ) {
    throw new Error("This email is unauthorized");
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      email: input.email,
    },
  });

  const adminEmailRegex = env.ADMIN_EMAILS
    ? new RegExp(env.ADMIN_EMAILS)
    : undefined;
  const makeAdmin = adminEmailRegex ? adminEmailRegex.test(input.email) : false;

  const user = await prisma.user.upsert({
    where: {
      email: input.email,
    },
    update: {
      email: input.email,
    },
    create: {
      email: input.email,
      authenticationMethod: "MAGIC_LINK",
      admin: makeAdmin, // only on create, to prevent automatically removing existing admins
    },
  });

  return {
    user,
    isNewUser: !existingUser,
  };
}

export async function findOrCreateGoogleUser({
  email,
  authenticationProfile,
  authenticationExtraParams,
}: FindOrCreateGoogle): Promise<LoggedInUser> {
  const name = authenticationProfile._json.name;
  let avatarUrl: string | undefined = undefined;
  if (authenticationProfile.photos[0]) {
    avatarUrl = authenticationProfile.photos[0].value;
  }
  const displayName = authenticationProfile.displayName;
  const authProfile = authenticationProfile
    ? (authenticationProfile as unknown as Prisma.JsonObject)
    : undefined;
  const authExtraParams = authenticationExtraParams
    ? (authenticationExtraParams as unknown as Prisma.JsonObject)
    : undefined;

  const authIdentifier = `github:${authenticationProfile.id}`;

  const existingUser = await prisma.user.findUnique({
    where: {
      authIdentifier,
    },
  });

  const existingEmailUser = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (existingEmailUser && !existingUser) {
    const user = await prisma.user.update({
      where: {
        email,
      },
      data: {
        authenticationProfile: authProfile,
        authenticationExtraParams: authExtraParams,
        avatarUrl,
        authIdentifier,
      },
    });

    return {
      user,
      isNewUser: false,
    };
  }

  if (existingEmailUser && existingUser) {
    const user = await prisma.user.update({
      where: {
        id: existingUser.id,
      },
      data: {},
    });

    return {
      user,
      isNewUser: false,
    };
  }

  const user = await prisma.user.upsert({
    where: {
      authIdentifier,
    },
    update: {},
    create: {
      authenticationProfile: authProfile,
      authenticationExtraParams: authExtraParams,
      name,
      avatarUrl,
      displayName,
      authIdentifier,
      email,
      authenticationMethod: "GOOGLE",
    },
  });

  return {
    user,
    isNewUser: !existingUser,
  };
}

export async function getUserById(id: User["id"]) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      Workspace: true,
    },
  });

  if (!user) {
    return null;
  }

  return {
    ...user,
  };
}

export async function getUserLeftCredits(id: User["id"]) {
  const userUsage = await prisma.userUsage.findFirst({ where: { userId: id } });

  if (!userUsage) {
    return null;
  }

  return {
    ...userUsage,
  };
}

export async function getUserByEmail(email: User["email"]) {
  return prisma.user.findUnique({ where: { email } });
}

export function updateUser({
  id,
  marketingEmails,
  referralSource,
  onboardingComplete,
  metadata,
}: Pick<User, "id" | "onboardingComplete" | "metadata"> & {
  marketingEmails?: boolean;
  referralSource?: string;
}) {
  return prisma.user.update({
    where: { id },
    data: {
      marketingEmails,
      referralSource,
      confirmedBasicDetails: true,
      onboardingComplete,
      metadata: metadata ? metadata : {},
    },
  });
}

export async function grantUserCloudAccess({
  id,
  inviteCode,
}: {
  id: string;
  inviteCode: string;
}) {
  return prisma.user.update({
    where: { id },
    data: {
      InvitationCode: {
        connect: {
          code: inviteCode,
        },
      },
    },
  });
}

export async function deleteUser(id: User["id"]) {
  // Get user's workspace
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      Workspace: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Delete all user-related nodes from the Neo4j knowledge graph
  try {
    // Delete all nodes (Episodes, Entities, Statements, Spaces, Documents, Clusters)
    // and their relationships where userId matches
    await runQuery(
      `
      MATCH (n {userId: $userId})
      DETACH DELETE n
      `,
      { userId: id }
    );
    console.log(`Deleted all graph nodes for user ${id}`);
  } catch (error) {
    console.error("Failed to delete graph nodes:", error);
    // Continue with deletion even if graph cleanup fails
  }

  // If workspace exists, delete all workspace-related data
  // Most models DON'T have onDelete: Cascade, so we must delete manually
  if (user.Workspace) {
    const workspaceId = user.Workspace.id;

    // 1. Delete nested conversation data
    await prisma.conversationExecutionStep.deleteMany({
      where: {
        conversationHistory: {
          conversation: { workspaceId },
        },
      },
    });

    await prisma.conversationHistory.deleteMany({
      where: {
        conversation: { workspaceId },
      },
    });

    await prisma.conversation.deleteMany({
      where: { workspaceId },
    });

    // 2. Delete space patterns (nested under Space)
    await prisma.spacePattern.deleteMany({
      where: {
        space: { workspaceId },
      },
    });

    await prisma.space.deleteMany({
      where: { workspaceId },
    });

    // 3. Delete webhook delivery logs (nested under WebhookConfiguration)
    await prisma.webhookDeliveryLog.deleteMany({
      where: {
        webhookConfiguration: { workspaceId },
      },
    });

    await prisma.webhookConfiguration.deleteMany({
      where: { workspaceId },
    });

    // 4. Delete ingestion data
    await prisma.ingestionQueue.deleteMany({
      where: { workspaceId },
    });

    await prisma.ingestionRule.deleteMany({
      where: { workspaceId },
    });

    // 5. Delete integration accounts
    await prisma.integrationAccount.deleteMany({
      where: { workspaceId },
    });

    await prisma.integrationDefinitionV2.deleteMany({
      where: { workspaceId },
    });

    // 6. Delete recall logs
    await prisma.recallLog.deleteMany({
      where: { workspaceId },
    });

    // 7. Delete activities
    await prisma.activity.deleteMany({
      where: { workspaceId },
    });

    // 8. Delete MCP sessions
    await prisma.mCPSession.deleteMany({
      where: { workspaceId },
    });

    // 9. Delete billing history (nested under Subscription)
    await prisma.billingHistory.deleteMany({
      where: {
        subscription: { workspaceId },
      },
    });

    await prisma.subscription.deleteMany({
      where: { workspaceId },
    });

    // 10. Delete the workspace (this will CASCADE delete OAuth models automatically)
    await prisma.workspace.delete({
      where: { id: workspaceId },
    });
  }

  // Delete user-specific data
  await prisma.personalAccessToken.deleteMany({
    where: { userId: id },
  });

  await prisma.userUsage.deleteMany({
    where: { userId: id },
  });

  // Finally, delete the user
  return prisma.user.delete({
    where: { id },
  });
}
