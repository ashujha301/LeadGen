import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(ROOT, pathFromRoot), "utf8");
}

function listFilesRecursive(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function terraformTree(): string {
  return listFilesRecursive(join(ROOT, "infra/terraform"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

describe("GCP Docker Hub deployment contract", () => {
  it("removes Artifact Registry modules, IAM, outputs, and workflow usage", () => {
    expect(existsSync(join(ROOT, "infra/terraform/modules/registry"))).toBe(false);

    const tf = terraformTree();
    expect(tf).not.toMatch(/artifact.?registry/i);
    expect(tf).not.toMatch(/google_artifact_registry/);
    expect(tf).not.toMatch(/roles\/artifactregistry/);
    expect(tf).not.toMatch(/module\s+"registry"/);
    expect(tf).not.toMatch(/artifact_registry/);

    const deploy = read(".github/workflows/deploy.yml");
    expect(deploy).not.toMatch(/docker\.pkg\.dev/);
    expect(deploy).not.toMatch(/ARTIFACT_REPOSITORY/);
    expect(deploy).not.toMatch(/configure-docker/);
  });

  it("protects the static IP with prevent_destroy", () => {
    const network = read("infra/terraform/modules/network/main.tf");
    expect(network).toMatch(/resource\s+"google_compute_address"\s+"static_ip"/);
    expect(network).toMatch(/prevent_destroy\s*=\s*true/);
  });

  it("exposes only ports 80 and 443 publicly and SSH only from IAP", () => {
    const network = read("infra/terraform/modules/network/main.tf");
    expect(network).toMatch(/ports\s*=\s*\["80"\]/);
    expect(network).toMatch(/ports\s*=\s*\["443"\]/);
    expect(network).toMatch(/source_ranges\s*=\s*\["0\.0\.0\.0\/0"\]/);
    expect(network).toMatch(/ports\s*=\s*\["22"\]/);
    expect(network).toMatch(/source_ranges\s*=\s*\["35\.235\.240\.0\/20"\]/);
  });

  it("restricts WIF to ashujha301/LeadGen on refs/heads/main", () => {
    const iam = read("infra/terraform/modules/iam/main.tf");
    expect(iam).toMatch(
      /assertion\.repository\s*==\s*'\$\{var\.repository_owner\}\/\$\{var\.repository_name\}'/,
    );
    expect(iam).not.toMatch(/assertion\.repository\s*==\s*'\$\{var\.repository_name\}'/);

    const vars = read("infra/terraform/environments/demo/variables.tf");
    expect(vars).toMatch(/default\s*=\s*"ashujha301"/);
    expect(vars).toMatch(/default\s*=\s*"LeadGen"/);
    expect(vars).toMatch(/default\s*=\s*"refs\/heads\/main"/);
  });

  it("keeps Terraform workflow validate-only with no apply job", () => {
    const tfWorkflow = read(".github/workflows/terraform.yml");
    expect(tfWorkflow).not.toMatch(/^\s+apply:/m);
    expect(tfWorkflow).not.toMatch(/terraform apply/);
    expect(tfWorkflow).not.toMatch(/id-token:\s*write/);
    expect(tfWorkflow).toMatch(/terraform fmt -check/);
    expect(tfWorkflow).toMatch(/terraform validate/);
  });

  it("uses Docker Hub immutable tags ashujha301/leadgen:web|worker-<sha>", () => {
    const deploy = read(".github/workflows/deploy.yml");
    expect(deploy).toMatch(/ashujha301\/leadgen:web-/);
    expect(deploy).toMatch(/ashujha301\/leadgen:worker-/);
    expect(deploy).not.toMatch(/docker\.pkg\.dev/);
  });

  it("uses /opt/leadgen runtime paths, never /run/leadgen-demo", () => {
    const files = [
      ".github/workflows/deploy.yml",
      "infra/scripts/deploy.sh",
      "infra/scripts/rollback.sh",
      "infra/scripts/load-secrets.sh",
      "infra/docker/compose.production.yml",
    ];
    for (const file of files) {
      const content = read(file);
      expect(content).not.toMatch(/\/run\/leadgen-demo/);
      expect(content).toMatch(/\/opt\/leadgen/);
    }
  });

  it("requires a real production migration command, not a placeholder", () => {
    const deployScript = read("infra/scripts/deploy.sh");
    expect(deployScript).not.toMatch(/TODO|placeholder|skip.?migrat/i);
    expect(deployScript).toMatch(/migrat/i);

    const compose = read("infra/docker/compose.production.yml");
    expect(compose).toMatch(/migrat/i);

    const workerDockerfile = read("infra/docker/Dockerfile.worker");
    expect(workerDockerfile).toMatch(/drizzle/);
  });

  it("gates deployment behind DEPLOY_ENABLED=true", () => {
    const deploy = read(".github/workflows/deploy.yml");
    expect(deploy).toMatch(/DEPLOY_ENABLED/);
    expect(deploy).toMatch(/vars\.DEPLOY_ENABLED\s*==\s*'true'|DEPLOY_ENABLED.*true/);
  });

  it("matches Secret Manager secret IDs for the 6-slot OAuth layout", () => {
    const loadSecrets = read("infra/scripts/load-secrets.sh");
    for (const secretId of [
      "leadgen-demo-database-url",
      "leadgen-demo-openai-api-key",
      "leadgen-demo-crustdata-api-key",
      "leadgen-demo-email-verifier-api-key",
      "leadgen-demo-dockerhub-pull-token",
      "leadgen-demo-google-client-id",
      "leadgen-demo-google-client-secret",
    ]) {
      expect(loadSecrets).toContain(secretId);
    }
    expect(loadSecrets).not.toContain("leadgen-demo-auth-secret");
    expect(loadSecrets).not.toContain("leadgen-demo-ip-hash-salt");
  });

  it("loads AUTH_SECRET and IP_HASH_SALT from config.env, not Secret Manager", () => {
    const loadSecrets = read("infra/scripts/load-secrets.sh");
    const configExample = read("infra/config/config.env.example");
    const forbiddenBlock = loadSecrets.match(
      /FORBIDDEN_CONFIG_KEYS=\([\s\S]*?\)/,
    )?.[0];

    expect(forbiddenBlock).toBeTruthy();
    expect(forbiddenBlock).not.toContain("IP_HASH_SALT");
    expect(forbiddenBlock).not.toContain("AUTH_SECRET");
    expect(forbiddenBlock).toContain("GOOGLE_CLIENT_ID");
    expect(forbiddenBlock).toContain("GOOGLE_CLIENT_SECRET");

    expect(loadSecrets).toMatch(/must set AUTH_SECRET and IP_HASH_SALT/);
    expect(configExample).toMatch(/AUTH_SECRET=/);
    expect(configExample).toMatch(/IP_HASH_SALT=/);
  });

  it("creates a blank Ubuntu VM without startup bootstrap", () => {
    const compute = read("infra/terraform/modules/compute/main.tf");
    expect(compute).toMatch(/ubuntu-os-cloud\/ubuntu-2404-lts-amd64|ubuntu-2404/);
    expect(compute).not.toMatch(/metadata_startup_script|startup_script/);
    expect(existsSync(join(ROOT, "infra/terraform/modules/compute/startup.sh.tftpl"))).toBe(false);
  });

  it("defaults demo environment to leadgen-507715 / us-east5 / e2-small", () => {
    const vars = read("infra/terraform/environments/demo/variables.tf");
    expect(vars).toMatch(/default\s*=\s*"leadgen-507715"/);
    expect(vars).toMatch(/default\s*=\s*"us-east5"/);
    expect(vars).toMatch(/default\s*=\s*"us-east5-b"/);
    expect(vars).toMatch(/default\s*=\s*"e2-small"/);
    expect(vars).toMatch(/default\s*=\s*20/);
    expect(vars).toMatch(/user:ashujha301@gmail\.com/);
  });
});
