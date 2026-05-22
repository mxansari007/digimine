"use client";

import { useState, useEffect } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { getTeacher } from "@/lib/firestore/teachers";
import { teacherFetch } from "@/lib/api/teacherFetch";
import type { Teacher } from "@digimine/types";

export default function TeacherEarningsPage() {
  const { firebaseUser } = useAuthContext();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    getTeacher(firebaseUser.uid).then((t) => {
      setTeacher(t);
      setLoading(false);
    });
  }, [firebaseUser]);

  const handlePayoutRequest = async () => {
    if (!firebaseUser || !teacher) return;
    if (teacher.usage.pendingPayout < 1000) {
      alert("Minimum payout is ₹1,000");
      return;
    }

    setRequesting(true);
    try {
      const res = await teacherFetch(firebaseUser, "/api/teacher/payout/request", {
        method: "POST",
        body: JSON.stringify({
          teacherId: firebaseUser.uid,
          amount: teacher.usage.pendingPayout,
          method: teacher.payoutDetails.upiId ? "upi" : "bank_transfer",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Payout request failed");
      }

      alert("Payout request submitted successfully!");
      getTeacher(firebaseUser.uid).then((t) => setTeacher(t));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRequesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-400" />
      </div>
    );
  }

  if (!teacher) {
    return (
      <div className="p-8 text-center text-slate-400">
        Teacher profile not found.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-950">Earnings</h1>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
          <div className="text-slate-500 text-sm mb-1">Total Earnings</div>
          <div className="text-3xl font-bold text-slate-950">
            ₹{teacher.usage.totalEarnings.toLocaleString()}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
          <div className="text-slate-500 text-sm mb-1">Pending Payout</div>
          <div className="text-3xl font-bold text-slate-950">
            ₹{teacher.usage.pendingPayout.toLocaleString()}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm shadow-slate-900/5 flex flex-col justify-between">
          <div>
            <div className="text-slate-500 text-sm mb-1">
              Available for Withdrawal
            </div>
            <div className="text-3xl font-bold text-slate-950">
              ₹{teacher.usage.pendingPayout.toLocaleString()}
            </div>
          </div>
          <button
            onClick={handlePayoutRequest}
            disabled={requesting || teacher.usage.pendingPayout < 1000}
            className="mt-4 w-full rounded-xl border border-primary-700 bg-primary-700 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary-950/10 transition-colors hover:bg-primary-800 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            {requesting ? "Processing..." : "Request Payout"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm shadow-slate-900/5">
        <h2 className="text-lg font-semibold text-slate-950 mb-4">
          Payout Details
        </h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">UPI ID</span>
            <span className="font-medium text-slate-900">
              {teacher.payoutDetails.upiId || "Not set"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Bank Account</span>
            <span className="font-medium text-slate-900">
              {teacher.payoutDetails.bankAccount ? "Set" : "Not set"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">PayPal</span>
            <span className="font-medium text-slate-900">
              {teacher.payoutDetails.paypalEmail || "Not set"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
