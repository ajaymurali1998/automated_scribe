"use client";

// The printable prescription. Laid out to match what an Indian patient and
// pharmacist expect: clinic letterhead, patient line, the ℞ symbol, a medications
// table, then advice and follow-up over the doctor's signature.
//
// react-pdf has no <table>, so the table is a flex grid of <View>/<Text>.
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { DoctorProfile, StructuredRx } from "@/types/prescription";

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 56, paddingHorizontal: 40, fontSize: 10, color: "#111827" },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  clinicName: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  doctorName: { fontSize: 11, fontWeight: 700 },
  muted: { color: "#6b7280" },
  rule: { borderBottomWidth: 1.5, borderBottomColor: "#111827", marginTop: 10, marginBottom: 12 },

  patientRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },

  rx: { fontSize: 20, fontWeight: 700, marginTop: 12, marginBottom: 6 },

  sectionLabel: { fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "#6b7280" },
  block: { marginBottom: 10 },

  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#d1d5db", paddingBottom: 4, marginBottom: 2 },
  tr: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
  thText: { fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#6b7280" },

  cDrug: { width: "34%", paddingRight: 6 },
  cDose: { width: "16%", paddingRight: 6 },
  cFreq: { width: "26%", paddingRight: 6 },
  cDur: { width: "24%" },

  drugName: { fontWeight: 700 },

  invRow: { flexDirection: "row", paddingVertical: 3 },
  invNum: { width: 16 },

  signBlock: { marginTop: 28, alignItems: "flex-end" },
  signature: { width: 120, height: 44, objectFit: "contain", marginBottom: 2 },
  signLine: { width: 150, borderTopWidth: 0.5, borderTopColor: "#9ca3af", paddingTop: 3, textAlign: "right" },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: "#d1d5db",
    paddingTop: 6,
    fontSize: 8,
    color: "#6b7280",
    textAlign: "center",
  },
});

type Props = {
  rx: StructuredRx;
  doctor: DoctorProfile;
  /** A short-lived signed URL for the signature image, if the doctor has uploaded one. */
  signatureUrl?: string | null;
};

function patientLine(rx: StructuredRx): string {
  const bits = [rx.patient.age, rx.patient.sex].filter(Boolean);
  return bits.length ? `${rx.patient.name || "—"} · ${bits.join(" · ")}` : rx.patient.name || "—";
}

const TYPE_LABEL: Record<string, string> = {
  lab: "Lab",
  imaging: "Imaging",
  procedure: "Procedure",
};

export default function PrescriptionPDF({ rx, doctor, signatureUrl }: Props) {
  const meds = rx.medications;
  // Physio/psychology visits carry no medications by design (see Section C of the
  // prompt) — the care plan IS the treatment. Printing an empty ℞ block under those
  // circumstances would look like a broken prescription rather than a therapy note.
  const isCarePlanVisit = meds.length === 0 && rx.care_plan.length > 0;

  return (
    <Document
      title={
        isCarePlanVisit
          ? `Care Plan — ${rx.patient.name || "patient"}`
          : `Prescription — ${rx.patient.name || "patient"}`
      }
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.clinicName}>{doctor.clinic_name || ""}</Text>
            {doctor.clinic_address ? <Text style={styles.muted}>{doctor.clinic_address}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.doctorName}>{doctor.full_name || ""}</Text>
            {doctor.qualifications ? <Text style={styles.muted}>{doctor.qualifications}</Text> : null}
            {doctor.registration_number ? (
              <Text style={styles.muted}>Reg. No. {doctor.registration_number}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.rule} />

        <View style={styles.patientRow}>
          <Text>
            <Text style={{ fontWeight: 700 }}>Patient: </Text>
            {patientLine(rx)}
          </Text>
          <Text>
            <Text style={{ fontWeight: 700 }}>Date: </Text>
            {rx.date}
          </Text>
        </View>

        {rx.complaints ? (
          <View style={styles.block}>
            <Text style={styles.sectionLabel}>Complaints</Text>
            <Text>{rx.complaints}</Text>
          </View>
        ) : null}

        {rx.diagnosis ? (
          <View style={styles.block}>
            <Text style={styles.sectionLabel}>Diagnosis</Text>
            <Text>{rx.diagnosis}</Text>
          </View>
        ) : null}

        {/* A tests-only visit is legitimate, so the ℞ block is skipped entirely rather
            than printing an empty table under a prescription symbol. */}
        {meds.length > 0 ? (
          <>
            <Text style={styles.rx}>℞</Text>

            <View style={styles.th}>
              <Text style={[styles.cDrug, styles.thText]}>Medicine</Text>
              <Text style={[styles.cDose, styles.thText]}>Dose</Text>
              <Text style={[styles.cFreq, styles.thText]}>Frequency</Text>
              <Text style={[styles.cDur, styles.thText]}>Duration</Text>
            </View>

            {meds.map((m, i) => (
              <View key={i} style={styles.tr} wrap={false}>
                <View style={styles.cDrug}>
                  <Text style={styles.drugName}>
                    {i + 1}. {m.form ? `${m.form} ` : ""}
                    {m.name}
                  </Text>
                  {m.instructions ? <Text style={styles.muted}>{m.instructions}</Text> : null}
                </View>
                <Text style={styles.cDose}>{m.strength ?? ""}</Text>
                <View style={styles.cFreq}>
                  <Text>{m.frequency ?? ""}</Text>
                  {m.timing ? <Text style={styles.muted}>{m.timing}</Text> : null}
                </View>
                <Text style={styles.cDur}>{m.duration ?? ""}</Text>
              </View>
            ))}
          </>
        ) : null}

        {/* Investigations print because the patient physically needs them to get the
            work done at a lab. unclear_segments deliberately does NOT print — it is a
            review aid for the doctor, and would only alarm a patient. */}
        {rx.investigations.length > 0 ? (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.sectionLabel}>Investigations advised</Text>
            {rx.investigations.map((inv, i) => (
              <View key={i} style={styles.invRow} wrap={false}>
                <Text style={styles.invNum}>{i + 1}.</Text>
                <View style={{ flex: 1 }}>
                  <Text>
                    <Text style={styles.drugName}>{inv.name}</Text>
                    {inv.type ? <Text style={styles.muted}> ({TYPE_LABEL[inv.type] ?? inv.type})</Text> : null}
                  </Text>
                  {inv.instructions ? <Text style={styles.muted}>{inv.instructions}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Ordered after investigations, mirroring the editor. When there are no
            medications this section carries the visit — give it the same visual
            weight the ℞ block would otherwise have, so the page doesn't read as an
            empty prescription with a plan bolted on. */}
        {rx.care_plan.length > 0 ? (
          <View style={{ marginTop: isCarePlanVisit ? 12 : 16 }}>
            {isCarePlanVisit ? <Text style={styles.rx}>Care Plan</Text> : <Text style={styles.sectionLabel}>Care plan</Text>}
            {rx.care_plan.map((c, i) => (
              <View key={i} style={styles.invRow} wrap={false}>
                <Text style={styles.invNum}>{i + 1}.</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.drugName}>{c.activity}</Text>
                  {(c.frequency || c.duration) ? (
                    <Text style={styles.muted}>{[c.frequency, c.duration].filter(Boolean).join(" · ")}</Text>
                  ) : null}
                  {c.instructions ? <Text style={styles.muted}>{c.instructions}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {rx.referral && (rx.referral.specialist || rx.referral.reason) ? (
          <View style={[styles.block, { marginTop: 16 }]}>
            <Text style={styles.sectionLabel}>Referred to</Text>
            <Text>
              <Text style={styles.drugName}>{rx.referral.specialist || "—"}</Text>
              {rx.referral.reason ? <Text> — {rx.referral.reason}</Text> : null}
            </Text>
          </View>
        ) : null}

        {rx.advice ? (
          <View style={[styles.block, { marginTop: 16 }]}>
            <Text style={styles.sectionLabel}>Advice</Text>
            <Text>{rx.advice}</Text>
          </View>
        ) : null}

        {rx.follow_up ? (
          <View style={styles.block}>
            <Text style={styles.sectionLabel}>Follow-up</Text>
            <Text>{rx.follow_up}</Text>
          </View>
        ) : null}

        <View style={styles.signBlock}>
          {signatureUrl ? <Image src={signatureUrl} style={styles.signature} /> : null}
          <Text style={styles.signLine}>{doctor.full_name || ""}</Text>
        </View>

        <Text style={styles.footer} fixed>
          {[doctor.clinic_name, doctor.clinic_address].filter(Boolean).join(" · ")}
        </Text>
      </Page>
    </Document>
  );
}
