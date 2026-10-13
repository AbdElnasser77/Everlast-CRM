"use client";

import { useState } from "react";
import { UserRoundCheck } from "lucide-react";
import {
  ApiError, apiBookRequest, apiClaimBookingRequest, apiNotBookedRequest, apiReopenBookingRequest, apiSetBookingRequestSource,
} from "@/lib/api";
import type { BookingRequest, PersonRef } from "@/types";
import { useToast } from "@/components/ui/toast";
import { personName } from "@/lib/chatOutcome";
import { notBookedLabel, notifyRequestChanged, requestSource } from "@/lib/bookingRequests";
import { BookDialog } from "@/components/bookings/BookDialog";
import { NotBookedDialog } from "@/components/bookings/NotBookedDialog";
import { DialogShell } from "@/components/bookings/DialogShell";
import { ChangeSourceDialog, toSaveError } from "@/components/bookings/LeadSourcePicker";

type Dialog =
  | { kind: "book"; req: BookingRequest }
  | { kind: "not_booked"; req: BookingRequest }
  | { kind: "source"; req: BookingRequest }
  | { kind: "takeover"; req: BookingRequest; by: string };

export type RequestBusy = { id: number; action: "claim" | "reopen" } | null;

const errMsg = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

function claimedByName(details: ApiError["details"]): string {
  const by = details?.claimedBy as PersonRef | string | null | undefined;
  if (!by) return "A colleague";
  return typeof by === "string" ? by : personName(by);
}

/**
 * Take it / Book / Couldn't book / Reopen / Change source for a booking request, with their
 * dialogs. Shared by the Bookings page, the chat banner and the contact panel.
 * Render `dialogs` somewhere in the tree.
 */
export function useRequestActions(
  onChanged?: (req: BookingRequest) => void,
  /** Named in the dialogs when the request doesn't carry its customer (the chat's patient). */
  fallbackPatient?: string | null,
) {
  const toast = useToast();
  const [busy, setBusy] = useState<RequestBusy>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const changed = (req: BookingRequest) => {
    notifyRequestChanged(req.conversationId);
    onChanged?.(req);
  };
  const patientOf = (req: BookingRequest) =>
    req.customer?.name || (req.customer?.phone ? `+${req.customer.phone}` : null) || fallbackPatient || null;

  async function claim(req: BookingRequest, force = false) {
    setBusy({ id: req.id, action: "claim" });
    try {
      const res = await apiClaimBookingRequest(req.id, force ? { force: true } : {});
      setDialog(null);
      toast.success(force ? "You've taken over this request" : "It's yours — you're handling this request");
      changed(res.data);
    } catch (err) {
      if (!force && err instanceof ApiError && err.status === 409 && err.code === "REQUEST_CLAIMED") {
        setDialog({ kind: "takeover", req, by: claimedByName(err.details) });
      } else {
        toast.error(errMsg(err, "Couldn't take this request"));
      }
    } finally {
      setBusy(null);
    }
  }

  async function reopen(req: BookingRequest) {
    setBusy({ id: req.id, action: "reopen" });
    try {
      const res = await apiReopenBookingRequest(req.id);
      toast.success("Request reopened — it's back in progress");
      changed(res.data);
    } catch (err) {
      toast.error(errMsg(err, "Couldn't reopen this request"));
    } finally {
      setBusy(null);
    }
  }

  const close = () => setDialog(null);

  const dialogs = dialog && (
    dialog.kind === "book" ? (
      <BookDialog
        key={`book-${dialog.req.id}`}
        requested={dialog.req.requested}
        patient={patientOf(dialog.req)}
        adding={dialog.req.status === "BOOKED"}
        sourceRequest={dialog.req}
        onCancel={close}
        onSave={async (appointments, source) => {
          try {
            const res = await apiBookRequest(dialog.req.id, appointments, source);
            setDialog(null);
            toast.success(appointments.length > 1 ? `${appointments.length} appointments recorded` : "Appointment recorded");
            changed(res.data);
            return null;
          } catch (err) {
            return toSaveError(err, "Couldn't save the booking");
          }
        }}
      />
    ) : dialog.kind === "source" ? (
      <ChangeSourceDialog
        key={`src-${dialog.req.id}`}
        req={dialog.req}
        onCancel={close}
        onSave={async (source) => {
          try {
            const res = await apiSetBookingRequestSource(dialog.req.id, source);
            setDialog(null);
            toast.success(`Source saved · ${requestSource(res.data)}`);
            changed(res.data);
            return null;
          } catch (err) {
            return toSaveError(err, "Couldn't save the source");
          }
        }}
      />
    ) : dialog.kind === "not_booked" ? (
      <NotBookedDialog
        key={`nb-${dialog.req.id}`}
        patient={patientOf(dialog.req)}
        onCancel={close}
        onSave={async (reason, note) => {
          try {
            const res = await apiNotBookedRequest(dialog.req.id, reason, note);
            setDialog(null);
            toast.success(`Closed as not booked · ${notBookedLabel(reason)}`);
            changed(res.data);
            return null;
          } catch (err) {
            if (err instanceof ApiError && err.code === "REQUEST_HAS_BOOKINGS") {
              return err.message || "This request has appointments — cancel them first (contact panel → Bookings).";
            }
            return errMsg(err, "Couldn't close the request");
          }
        }}
      />
    ) : (
      <DialogShell title={`${dialog.by} is handling this`} onCancel={close} saving={busy?.id === dialog.req.id}>
        <div className="px-6 pb-6">
          <div className="flex items-start gap-3 mb-5">
            <span className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
              <UserRoundCheck className="w-5 h-5 text-amber-600" />
            </span>
            <p className="text-[13px] text-gray-500">
              {dialog.by} already took this request. Take it over? They&apos;ll see it moved to you.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" autoFocus onClick={close} disabled={busy?.id === dialog.req.id} className="px-4 py-2 rounded-xl text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50">
              Leave it with {dialog.by.split(" ")[0]}
            </button>
            <button
              type="button"
              onClick={() => claim(dialog.req, true)}
              disabled={busy?.id === dialog.req.id}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-colors cursor-pointer disabled:opacity-60"
            >
              Take it over
            </button>
          </div>
        </div>
      </DialogShell>
    )
  );

  return {
    busy,
    claim: (req: BookingRequest) => claim(req),
    book: (req: BookingRequest) => setDialog({ kind: "book", req }),
    notBooked: (req: BookingRequest) => setDialog({ kind: "not_booked", req }),
    changeSource: (req: BookingRequest) => setDialog({ kind: "source", req }),
    reopen,
    dialogs,
  };
}
