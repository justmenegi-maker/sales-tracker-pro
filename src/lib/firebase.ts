import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  getRedirectResult,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
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

// Always show Google's account chooser. When the browser is already signed in
// to exactly one Google account, Google can skip its UI and close the popup
// straight away — which the SDK reports as `auth/popup-closed-by-user` even
// though the person never closed anything. Asking for the chooser keeps the
// flow visible and gives the popup a window to finish in.
googleProvider.setCustomParameters({ prompt: "select_account" });

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

/**
 * Logs a Firestore failure in a structured shape and returns something worth
 * showing the person who pressed the button.
 *
 * A write that a click handler awaits must come back as a result the handler can
 * display: a thrown error leaves the form stuck on "Filing…" with no message at
 * all.
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
    // Two audiences read this: branch staff, whose account may not be linked to a
    // branch yet, and admins, for whom the deployed security rules are usually
    // the older copy. Naming both beats a message that sends an admin looking for
    // a branch assignment they already have.
    return `Firestore refused to ${action}. If you are branch staff, your account may not be linked to a branch yet — ask an admin. If you are an admin, the deployed security rules may be out of date.`;
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return `Could not reach Firestore to ${action}. Check the connection and try again.`;
  }

  const detail = error instanceof Error ? error.message : String(error);
  return `Could not ${action}. ${detail}`;
}

export {
  browserLocalPersistence,
  fbSignOut,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  type User,
};
