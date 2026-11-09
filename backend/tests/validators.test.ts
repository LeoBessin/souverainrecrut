import { describe, expect, it } from "vitest";

import { createApplicationSchema, updateApplicationSchema } from "../src/validators/application.schema";
import { createCandidateSchema } from "../src/validators/candidate.schema";
import { createJobSchema, updateJobSchema } from "../src/validators/job.schema";
import { createUserSchema, updateUserSchema } from "../src/validators/user.schema";

describe("validators", () => {
  it("job", () => {
    const ok = { title: "Dev", description: "Une description longue", location: "Conakry", company: "ACME", recruiterId: "1" };
    expect(createJobSchema.safeParse(ok).success).toBe(true);
    expect(createJobSchema.safeParse({ ...ok, title: "ab" }).success).toBe(false);
    expect(updateJobSchema.safeParse({}).success).toBe(true);
  });

  it("application", () => {
    expect(createApplicationSchema.safeParse({ candidateId: "1", jobId: "2" }).success).toBe(true);
    expect(createApplicationSchema.safeParse({ candidateId: "", jobId: "2" }).success).toBe(false);
    expect(updateApplicationSchema.safeParse({ status: "NOPE" }).success).toBe(false);
  });

  it("candidate et user rejettent un corps vide", () => {
    expect(createCandidateSchema.safeParse({}).success).toBe(false);
    expect(createUserSchema.safeParse({}).success).toBe(false);
    expect(updateUserSchema.safeParse({ email: "pas-un-email" }).success).toBe(false);
  });
});
