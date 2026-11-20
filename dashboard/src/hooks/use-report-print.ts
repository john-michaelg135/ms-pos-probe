import { useState } from "react";
import { useAuthStore } from "@/stores/use-auth-store";

const SIGNATURE_KEY = (username: string) => `report-signature:${username}`;

export function useReportPrint() {
  const user = useAuthStore((state) => state.user);
  const preparedBy = user?.displayName || user?.username || "";
  // Print / PDF first asks for a signature; it is placed on the printout's sign-off line.
  const [isSigning, setIsSigning] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);

  // Read the remembered signature when signing starts, so it always matches who is signed in.
  const startSigning = () => {
    let saved: string | null = null;
    try {
      if (user?.username) saved = window.localStorage.getItem(SIGNATURE_KEY(user.username));
    } catch {
      saved = null;
    }
    setSavedSignature(saved);
    setIsSigning(true);
  };

  const saveSignature = (value: string) => {
    if (!user?.username) return;
    try {
      window.localStorage.setItem(SIGNATURE_KEY(user.username), value);
    } catch {
      // Storage full or blocked: the signature still prints, it just isn't remembered.
    }
    setSavedSignature(value);
  };

  // Same as the POS: the PDF file name comes from the document title while printing.
  const printPage = (title: string) => {
    const originalTitle = document.title;
    document.title = title;
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.title = originalTitle;
      }, 1000);
    }, 250);
  };

  const signingDialog = (documentTitle: string) => ({
    open: isSigning,
    onOpenChange: setIsSigning,
    signerName: preparedBy,
    savedSignature,
    onSaveSignature: saveSignature,
    onConfirm: (signed: string) => {
      setSignature(signed);
      setIsSigning(false);
      printPage(documentTitle);
    },
  });

  return { preparedBy, signature, startSigning, signingDialog };
}
