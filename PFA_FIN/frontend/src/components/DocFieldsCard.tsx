interface DocFieldsResult {
  photo_base64: string | null;
  fields: Record<string, string>;
  field_labels: Record<string, string>;
  error: string | null;
}

interface Props {
  doc: DocFieldsResult;
}

// Fields to show in left column vs right column
const LEFT_FIELDS = ["surname", "names", "surname_arabic", "names_arabic"];
const RIGHT_FIELDS = [
  "date_of_birth",
  "expiration_date",
  "number",
  "sex",
  "nationality",
];

function FieldRow({ label, value }: { label: string; value: string }) {
  const isArabic = /[\u0600-\u06FF]/.test(label);
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-gray-100 last:border-0">
      <span
        className={`text-[10px] font-semibold text-gray-400 uppercase tracking-wide ${isArabic ? "text-right" : ""}`}
      >
        {label}
      </span>
      <span
        className={`text-sm font-semibold text-gray-800 ${isArabic ? "text-right font-arabic" : "font-mono"}`}
        dir={isArabic ? "rtl" : "ltr"}
      >
        {value}
      </span>
    </div>
  );
}

export default function DocFieldsCard({ doc }: Props) {
  if (!doc) return null;

  const hasFields = Object.keys(doc.fields).length > 0;
  const hasPhoto = Boolean(doc.photo_base64);

  if (!hasFields && !hasPhoto) return null;

  const leftFields = LEFT_FIELDS.filter((k) => doc.fields[k]);
  const rightFields = RIGHT_FIELDS.filter((k) => doc.fields[k]);

  // Fields not in either predefined list (unexpected extras)
  const knownKeys = new Set([...LEFT_FIELDS, ...RIGHT_FIELDS]);
  const extraFields = Object.keys(doc.fields).filter((k) => !knownKeys.has(k));

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-6 overflow-hidden">
      {/* ── Header ── */}
      <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">🪪</span>
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
          Extracted Document Info
        </h2>
        {doc.error && (
          <span className="ml-auto text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            Partial extraction
          </span>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex gap-0 divide-x divide-gray-100">
        {/* Photo column */}
        <div className="flex flex-col items-center justify-start p-5 min-w-[140px]">
          {hasPhoto ? (
            <>
              <img
                src={`data:image/png;base64,${doc.photo_base64}`}
                alt="Document photo"
                className="w-28 h-36 object-cover rounded-lg border border-gray-200 shadow-sm"
              />
              <p className="text-[10px] text-gray-400 mt-2">Photo extracted</p>
            </>
          ) : (
            <div className="w-28 h-36 bg-gray-100 rounded-lg border border-dashed border-gray-300 flex flex-col items-center justify-center gap-1">
              <span className="text-2xl">👤</span>
              <p className="text-[10px] text-gray-400">No photo</p>
            </div>
          )}
        </div>

        {/* Fields: left + right */}
        {hasFields && (
          <div className="flex-1 grid grid-cols-2 divide-x divide-gray-100">
            {/* Left column — name fields */}
            <div className="px-5 py-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Identity
              </p>
              {leftFields.length > 0 ? (
                leftFields.map((k) => (
                  <FieldRow
                    key={k}
                    label={doc.field_labels[k] ?? k.replace(/_/g, " ")}
                    value={doc.fields[k]}
                  />
                ))
              ) : (
                <p className="text-xs text-gray-400 italic">
                  No name extracted
                </p>
              )}
            </div>

            {/* Right column — document fields */}
            <div className="px-5 py-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Document
              </p>
              {rightFields.length > 0 ? (
                rightFields.map((k) => (
                  <FieldRow
                    key={k}
                    label={doc.field_labels[k] ?? k.replace(/_/g, " ")}
                    value={doc.fields[k]}
                  />
                ))
              ) : (
                <p className="text-xs text-gray-400 italic">
                  No document fields extracted
                </p>
              )}

              {/* Extra fields if any */}
              {extraFields.map((k) => (
                <FieldRow
                  key={k}
                  label={doc.field_labels[k] ?? k.replace(/_/g, " ")}
                  value={doc.fields[k]}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
