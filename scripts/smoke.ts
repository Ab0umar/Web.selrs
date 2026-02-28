import assert from "node:assert/strict";
import { URLSearchParams } from "node:url";
import "dotenv/config";

const baseUrl =
  process.env.BASE_URL ||
  `http://127.0.0.1:${process.env.PORT || "4000"}`;
const adminUser =
  process.env.SMOKE_USER ||
  process.env.ADMIN_USER ||
  process.env.E2E_USER ||
  "";
const adminPass =
  process.env.SMOKE_PASS ||
  process.env.ADMIN_PASS ||
  process.env.E2E_PASS ||
  "";

type CookieJar = { cookie?: string };

function extractCookieFromHeaders(headers: Headers): string | undefined {
  const anyHeaders = headers as unknown as { getSetCookie?: () => string[] };
  const setCookies = typeof anyHeaders.getSetCookie === "function"
    ? anyHeaders.getSetCookie()
    : [];
  const raw = setCookies.length > 0 ? setCookies[0] : headers.get("set-cookie");
  if (!raw) return undefined;
  const first = raw.split(";")[0];
  return first || undefined;
}

async function requestJson(
  path: string,
  options: { method?: string; body?: unknown; jar?: CookieJar; query?: Record<string, string> } = {},
) {
  const method = options.method || "GET";
  const headers: Record<string, string> = {};
  if (options.jar?.cookie) headers["Cookie"] = options.jar.cookie;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const url = new URL(path, baseUrl);
  if (options.query) {
    const params = new URLSearchParams(options.query);
    url.search = params.toString();
  }

  const res = await fetch(url, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (options.jar) {
    const cookie = extractCookieFromHeaders(res.headers);
    if (cookie) options.jar.cookie = cookie;
  }

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  return { status: res.status, json };
}

async function requestText(
  path: string,
  options: { method?: string; body?: unknown; jar?: CookieJar } = {},
) {
  const method = options.method || "GET";
  const headers: Record<string, string> = {};
  if (options.jar?.cookie) headers["Cookie"] = options.jar.cookie;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const url = new URL(path, baseUrl);
  const res = await fetch(url, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (options.jar) {
    const cookie = extractCookieFromHeaders(res.headers);
    if (cookie) options.jar.cookie = cookie;
  }

  const text = await res.text();
  return { status: res.status, text, contentType: res.headers.get("content-type") ?? "" };
}

function trpcInput(input: unknown): Record<string, string> {
  return { input: JSON.stringify({ json: input }) };
}

function hasRole(role: string | undefined, allowed: string[]) {
  if (!role) return false;
  return allowed.includes(role);
}

async function run() {
  const jar: CookieJar = {};

  const root = await requestText("/", { jar });
  assert.equal(root.status, 200, "frontend root should return 200");
  assert.ok(root.contentType.includes("text/html"), "frontend should return HTML");

  const health = await requestJson("/api/trpc/system.health", {
    query: trpcInput({ timestamp: Date.now() }),
  });
  assert.equal(health.status, 200, "system.health should return 200");
  assert.equal(health.json?.result?.data?.json?.ok, true, "system.health ok flag");

  assert.ok(
    adminUser && adminPass,
    "Missing smoke credentials. Set SMOKE_USER and SMOKE_PASS (or ADMIN_USER/ADMIN_PASS).",
  );

  const login = await requestJson("/api/auth/login", {
    method: "POST",
    body: { username: adminUser, password: adminPass },
    jar,
  });
  assert.equal(
    login.status,
    200,
    `login should return 200 (base=${baseUrl}, user=${adminUser}, got=${login.status}, body=${JSON.stringify(login.json)})`,
  );
  assert.ok(jar.cookie, "login should set cookie");

  const me = await requestJson("/api/auth/me", { jar });
  assert.equal(me.status, 200, "auth/me should return 200");
  const currentUser = me.json?.user;
  const role = currentUser?.role as string | undefined;

  const patientCode = `P-${Math.floor(Math.random() * 1_000_000)}`;
  const createPatient = await requestJson("/api/trpc/medical.createPatient", {
    method: "POST",
    body: {
      json: {
        patientCode,
        fullName: "Smoke Test",
        phone: "01000000000",
        age: 30,
        gender: "male",
        branch: "examinations",
      },
    },
    jar,
  });
  assert.equal(createPatient.status, 200, "create patient should return 200");

  const search = await requestJson("/api/trpc/medical.searchPatients", {
    query: trpcInput({ searchTerm: "Smoke Test" }),
    jar,
  });
  assert.equal(search.status, 200, "search should return 200");
  const patientId = search.json?.result?.data?.json?.[0]?.id;
  assert.ok(patientId, "search should return patient id");

  const getAllPatientsBase = await requestJson("/api/trpc/medical.getAllPatients", {
    query: trpcInput({ limit: 25 }),
    jar,
  });
  assert.equal(getAllPatientsBase.status, 200, "getAllPatients should return 200");

  const serviceTypesToProbe = ["consultant", "specialist", "lasik", "external", "surgery"] as const;
  for (const serviceType of serviceTypesToProbe) {
    const filtered = await requestJson("/api/trpc/medical.getAllPatients", {
      query: trpcInput({ limit: 25, serviceType }),
      jar,
    });
    assert.equal(filtered.status, 200, `getAllPatients(${serviceType}) should return 200`);
  }

  const savePageState = await requestJson("/api/trpc/medical.savePatientPageState", {
    method: "POST",
    body: {
      json: {
        patientId,
        page: "examination",
        data: {
          serviceSheetTypeByCode: {
            "1513": "pentacam_center",
            "1514": "surgery_external",
          },
        },
      },
    },
    jar,
  });
  assert.equal(savePageState.status, 200, "savePatientPageState should return 200");

  const getPageState = await requestJson("/api/trpc/medical.getPatientPageState", {
    query: trpcInput({ patientId, page: "examination" }),
    jar,
  });
  assert.equal(getPageState.status, 200, "getPatientPageState should return 200");
  const stateData = getPageState.json?.result?.data?.json?.data ?? {};
  assert.equal(stateData?.serviceSheetTypeByCode?.["1513"], "pentacam_center", "should persist pentacam_center mapping");
  assert.equal(stateData?.serviceSheetTypeByCode?.["1514"], "surgery_external", "should persist surgery_external mapping");

  if (hasRole(role, ["admin"])) {
    const bulkSheet = await requestJson("/api/trpc/medical.bulkAssignSheetTypeToPatients", {
      method: "POST",
      body: {
        json: {
          patientIds: [patientId],
          sheetType: "surgery",
        },
      },
      jar,
    });
    assert.equal(bulkSheet.status, 200, "bulkAssignSheetTypeToPatients should return 200 for admin");
  }

  const createAppointment = await requestJson("/api/trpc/medical.createAppointment", {
    method: "POST",
    body: {
      json: {
        patientId,
        appointmentDate: new Date().toISOString(),
        appointmentType: "examination",
        branch: "examinations",
      },
    },
    jar,
  });
  assert.equal(createAppointment.status, 200, "create appointment should return 200");

  const appointmentsByPatient = await requestJson("/api/trpc/medical.getAppointmentsByPatient", {
    query: trpcInput({ patientId }),
    jar,
  });
  assert.equal(appointmentsByPatient.status, 200, "get appointments should return 200");

  if (hasRole(role, ["doctor", "admin", "manager"])) {
    const createReport = await requestJson("/api/trpc/medical.createMedicalReport", {
      method: "POST",
      body: {
        json: {
          patientId,
          diagnosis: "Myopia",
          treatment: "Glasses",
          recommendations: "Follow-up",
        },
      },
      jar,
    });
    assert.equal(createReport.status, 200, "create medical report should return 200");

    const createSurgery = await requestJson("/api/trpc/medical.createSurgery", {
      method: "POST",
      body: {
        json: {
          patientId,
          surgeryType: "LASIK",
          surgeryDate: new Date().toISOString(),
        },
      },
      jar,
    });
    assert.equal(createSurgery.status, 200, "create surgery should return 200");

    const surgeries = await requestJson("/api/trpc/medical.getSurgeriesByPatient", {
      query: trpcInput({ patientId }),
      jar,
    });
    assert.equal(surgeries.status, 200, "get surgeries should return 200");
  }

  if (hasRole(role, ["nurse", "admin", "manager"])) {
    const createExam = await requestJson("/api/trpc/medical.createExamination", {
      method: "POST",
      body: {
        json: {
          visitId: 0,
          patientId,
          ucvaOD: "20/40",
          ucvaOS: "20/40",
        },
      },
      jar,
    });
    assert.equal(createExam.status, 200, "create examination should return 200");
  }

  if (hasRole(role, ["technician", "admin", "manager"])) {
    const createPentacam = await requestJson("/api/trpc/medical.createPentacamResult", {
      method: "POST",
      body: {
        json: {
          visitId: 0,
          patientId,
          ltK1: 42.5,
          rtK1: 43.1,
        },
      },
      jar,
    });
    assert.equal(createPentacam.status, 200, "create pentacam should return 200");
  }

  if (hasRole(role, ["manager", "admin"])) {
    const medName = `SmokeMed-${Date.now()}`;
    const createMed = await requestJson("/api/trpc/medical.createMedication", {
      method: "POST",
      body: {
        json: {
          name: medName,
          type: "tablet",
          strength: "10mg",
        },
      },
      jar,
    });
    assert.equal(createMed.status, 200, "create medication should return 200");

    const meds = await requestJson("/api/trpc/medical.getMedications", { jar });
    assert.equal(meds.status, 200, "get medications should return 200");
    const medicationId = meds.json?.result?.data?.json?.find((m: any) => m.name === medName)?.id;
    assert.ok(medicationId, "created medication should be present");

    const updateMed = await requestJson("/api/trpc/medical.updateMedication", {
      method: "POST",
      body: {
        json: {
          medicationId,
          updates: { strength: "20mg" },
        },
      },
      jar,
    });
    assert.equal(updateMed.status, 200, "update medication should return 200");

    const deleteMed = await requestJson("/api/trpc/medical.deleteMedication", {
      method: "POST",
      body: { json: { medicationId } },
      jar,
    });
    assert.equal(deleteMed.status, 200, "delete medication should return 200");

    const testName = `SmokeTest-${Date.now()}`;
    const createTest = await requestJson("/api/trpc/medical.createTest", {
      method: "POST",
      body: {
        json: {
          name: testName,
          type: "lab",
          category: "General",
        },
      },
      jar,
    });
    assert.equal(createTest.status, 200, "create test should return 200");

    const tests = await requestJson("/api/trpc/medical.getTests", { jar });
    assert.equal(tests.status, 200, "get tests should return 200");
    const testId = tests.json?.result?.data?.json?.find((t: any) => t.name === testName)?.id;
    assert.ok(testId, "created test should be present");

    const updateTest = await requestJson("/api/trpc/medical.updateTest", {
      method: "POST",
      body: { json: { testId, updates: { normalRange: "0-1" } } },
      jar,
    });
    assert.equal(updateTest.status, 200, "update test should return 200");

    const deleteTest = await requestJson("/api/trpc/medical.deleteTest", {
      method: "POST",
      body: { json: { testId } },
      jar,
    });
    assert.equal(deleteTest.status, 200, "delete test should return 200");
  }

  // eslint-disable-next-line no-console
  console.log("Smoke tests passed.");
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Smoke tests failed:", err);
  process.exit(1);
});
