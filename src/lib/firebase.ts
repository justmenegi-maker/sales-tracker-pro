import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDocFromServer,
  type Firestore,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Logs a Firestore failure in the same structured shape as
 * `handleFirestoreError`, and returns something worth showing the person who
 * pressed the button.
 *
 * A write that a click handler awaits must come back as a result the handler can
 * display: `handleFirestoreError` throws, and a throw out of a click handler
 * leaves the form stuck on "Filing…" with no message at all.
 */
export function firestoreErrorMessage(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  action: string,
): string {
  console.error(
    "Firestore Error: ",
    JSON.stringify(buildFirestoreErrorInfo(error, operationType, path)),
  );

  const code = (error as { code?: string } | null | undefined)?.code ?? "";
  if (code === "permission-denied") {
    return `Firestore refused to ${action}. Your account may not be linked to a branch yet, so ask an admin to check your branch assignment.`;
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return `Could not reach Firestore to ${action}. Check the connection and try again.`;
  }

  const detail = error instanceof Error ? error.message : String(error);
  return `Could not ${action}. ${detail}`;
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("the client is offline")
    ) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

// Test connection when imported in browser
if (typeof window !== "undefined") {
  testConnection();
}

export { fbSignOut, onAuthStateChanged, signInWithPopup, type User };
