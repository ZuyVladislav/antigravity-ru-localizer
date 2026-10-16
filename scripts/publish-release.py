"""Build public Git source archives and publish an existing draft after exact CI gates."""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import zipfile

REPO = "ZuyVladislav/antigravity-ru-localizer"
PLATFORMS = {"test (windows-latest)", "test (ubuntu-latest)", "test (macos-14)"}


def run(*args):
    return subprocess.run(args, check=True, capture_output=True,
                          cwd=Path(__file__).resolve().parent.parent,
                          creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0).stdout


def api(path):
    return json.loads(run("gh", "api", f"repos/{REPO}/{path}"))


def validate_ci(workflow, jobs, commit):
    if (workflow.get("head_sha") != commit or workflow.get("status") != "completed"
            or workflow.get("conclusion") != "success"
            or workflow.get("path") != ".github/workflows/ci.yml"):
        raise ValueError("Exact release commit has not passed the required workflow")
    if {job["name"] for job in jobs} != PLATFORMS or len(jobs) != 3:
        raise ValueError("All three platform jobs are required")
    for job in jobs:
        if job.get("conclusion") != "success" or job.get("run_id") != workflow["id"]:
            raise ValueError("Platform CI failed or belongs to another run")
        required = "Run npm test"
        if not any(step["name"] == required and step["conclusion"] == "success" for step in job["steps"]):
            raise ValueError("Project tests did not pass")
        if job["name"] != "test (windows-latest)" and not any(
                step["name"] == "Run npm run platform-smoke-test" and step["conclusion"] == "success"
                for step in job["steps"]):
            raise ValueError("Platform installation/signing smoke test did not pass")


def write_checked(path, data):
    if path.exists() and path.read_bytes() != data:
        raise ValueError(f"Preserving a different existing artifact: {path.name}")
    path.write_bytes(data)


def package(tag, commit, output):
    if not re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+-r[1-9][0-9]*", tag):
        raise ValueError("Unsupported release tag")
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Expected an exact commit SHA")
    resolved = run("git", "rev-parse", f"refs/tags/{tag}^{{commit}}").decode().strip()
    if resolved != commit:
        raise ValueError("Tag does not match the expected release commit")
    entries = []
    total = 0
    for record in run("git", "ls-tree", "-rz", commit).split(b"\0"):
        if not record:
            continue
        header, name = record.split(b"\t", 1)
        mode, kind, blob = header.decode().split()
        name = name.decode("utf-8")
        if (mode not in {"100644", "100755"} or kind != "blob" or ".." in name.split("/")
                or name.startswith("/") or not re.fullmatch(r"[A-Za-z0-9._/-]+", name)):
            raise ValueError("Only regular tracked source files may be packaged")
        data = run("git", "show", f"{commit}:{name}")
        data.decode("utf-8")  # Never ship application binaries or arbitrary binary files.
        total += len(data)
        if len(data) > 2_000_000 or total > 8_000_000:
            raise ValueError("Source archive exceeds the reviewed size cap")
        entries.append((name, int(mode, 8) & 0o777, data, blob))
    version = json.loads(next(data for name, _, data, _ in entries if name == "package.json"))["version"]
    if tag.split("-r")[0] != "v" + version:
        raise ValueError("Release tag does not match the supported application version")
    output.mkdir(parents=True, exist_ok=True)
    stem = "antigravity-ru-localizer-" + tag
    zipped, tarred = io.BytesIO(), io.BytesIO()
    # Stored streams make byte-for-byte checks independent of host zlib versions.
    with zipfile.ZipFile(zipped, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, mode, data, _ in sorted(entries):
            member = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            member.create_system, member.external_attr = 3, (0o100000 | mode) << 16
            archive.writestr(member, data)
    with tarfile.open(fileobj=tarred, mode="w", format=tarfile.GNU_FORMAT) as archive:
        for name, mode, data, _ in sorted(entries):
            member = tarfile.TarInfo(name)
            member.mode, member.size, member.mtime = mode, len(data), 0
            archive.addfile(member, io.BytesIO(data))
    compressed = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=compressed, mtime=0, compresslevel=0) as stream:
        stream.write(tarred.getvalue())
    payloads = {stem + ".zip": zipped.getvalue(), stem + ".tar.gz": compressed.getvalue()}
    sums = "".join(f"{hashlib.sha256(data).hexdigest()}  {name}\n" for name, data in sorted(payloads.items()))
    payloads["SHA256SUMS.txt"] = sums.encode("ascii")
    for name, data in payloads.items():
        write_checked(output / name, data)
    return {name: {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
            for name, data in payloads.items()}


def asset_plan(release, tag, assets):
    if release.get("tag_name") != tag or release.get("prerelease"):
        raise ValueError("Unexpected release tag or pre-release status")
    existing = {item["name"]: item for item in release["assets"]}
    if len(existing) != len(release["assets"]) or set(existing) - set(assets):
        raise ValueError("Unexpected existing release assets; preserving them")
    for name, item in existing.items():
        if item.get("digest") != "sha256:" + assets[name]["sha256"] or item.get("size") != assets[name]["bytes"]:
            raise ValueError("Existing asset differs; it will not be replaced")
    missing = sorted(set(assets) - set(existing))
    if missing and not release.get("draft"):
        raise ValueError("An incomplete published release will not be modified")
    return missing


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--ci-run", type=int)
    parser.add_argument("--release-id", type=int)
    parser.add_argument("--zip-sha256")
    parser.add_argument("--tar-sha256")
    args = parser.parse_args()
    assets = package(args.tag, args.commit, args.output)
    if args.publish:
        for digest in (args.zip_sha256, args.tar_sha256):
            if not digest or not re.fullmatch(r"[0-9a-f]{64}", digest):
                raise ValueError("Previously reviewed local archive digests are required")
        stem = "antigravity-ru-localizer-" + args.tag
        if assets[stem + ".zip"]["sha256"] != args.zip_sha256 or assets[stem + ".tar.gz"]["sha256"] != args.tar_sha256:
            raise ValueError("Runner archives differ from reviewed local artifacts")
        validate_ci(api(f"actions/runs/{args.ci_run}"), api(f"actions/runs/{args.ci_run}/jobs?per_page=100")["jobs"], args.commit)
        if api(f"git/ref/tags/{args.tag}")["object"]["sha"] != args.commit:
            raise ValueError("Remote tag changed")
        release = api(f"releases/{args.release_id}")
        missing = asset_plan(release, args.tag, assets)
        if missing:
            run("gh", "release", "upload", args.tag, *(str(args.output / name) for name in missing), "--repo", REPO)
        release = api(f"releases/{args.release_id}")
        if asset_plan(release, args.tag, assets):
            raise ValueError("Uploaded release assets are incomplete")
        if release["draft"]:
            run("gh", "release", "edit", args.tag, "--draft=false", "--latest", "--verify-tag", "--repo", REPO)
        release = api(f"releases/{args.release_id}")
        if release["draft"] or asset_plan(release, args.tag, assets):
            raise ValueError("Publication was not verified")
        write_checked(args.output / "published-release.json", json.dumps(release, indent=2).encode())
    print(json.dumps({"tag": args.tag, "commit": args.commit, "assets": assets, "published": args.publish}))


if __name__ == "__main__":
    main()
