import json

from app.requirements.requirementDetection_requirement import detect_verification_requirements


def write_workspace_file(ws, name, text=""):
    path = ws / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def only_requirement(ws):
    reqs = detect_verification_requirements(str(ws)).requirements
    assert len(reqs) == 1, [r.label for r in reqs]
    return reqs[0]


def test_maven_pom_runs_quiet_test(tmp_path):
    write_workspace_file(tmp_path, "pom.xml", "<project/>")
    req = only_requirement(tmp_path)
    assert req.argv == ("mvn", "-q", "test")
    assert req.kind == "tests" and req.required and req.safe
    assert req.source == "project_manifest"
    assert "pom.xml" in req.influences


def test_gradle_prefers_wrapper_over_gradle(tmp_path):
    write_workspace_file(tmp_path, "build.gradle.kts")
    write_workspace_file(tmp_path, "gradlew")
    assert only_requirement(tmp_path).argv == ("./gradlew", "test")


def test_gradle_without_wrapper_uses_gradle(tmp_path):
    write_workspace_file(tmp_path, "build.gradle")
    req = only_requirement(tmp_path)
    assert req.argv == ("gradle", "test")
    assert "build.gradle" in req.influences


def test_scala_sbt(tmp_path):
    write_workspace_file(tmp_path, "build.sbt")
    req = only_requirement(tmp_path)
    assert req.argv == ("sbt", "test")
    assert "build.sbt" in req.influences


def test_cmake_configures_builds_then_ctest(tmp_path):
    write_workspace_file(tmp_path, "CMakeLists.txt", "project(x)")
    req = only_requirement(tmp_path)
    assert req.argv[0] == "sh" and req.argv[1] == "-c"
    assert "cmake -S . -B" in req.argv[2]
    assert "cmake --build" in req.argv[2]
    assert "ctest" in req.argv[2]
    assert "CMakeLists.txt" in req.influences


def test_swift_package(tmp_path):
    write_workspace_file(tmp_path, "Package.swift")
    req = only_requirement(tmp_path)
    assert req.argv == ("swift", "test")
    assert "Package.swift" in req.influences


def test_zig_build_test(tmp_path):
    write_workspace_file(tmp_path, "build.zig")
    req = only_requirement(tmp_path)
    assert req.argv == ("zig", "build", "test")
    assert "build.zig" in req.influences


def test_dotnet_from_csproj(tmp_path):
    write_workspace_file(tmp_path, "App.csproj")
    req = only_requirement(tmp_path)
    assert req.argv == ("dotnet", "test")
    assert "*.csproj" in req.influences


def test_flutter_when_pubspec_declares_flutter(tmp_path):
    write_workspace_file(
        tmp_path, "pubspec.yaml", "name: x\ndependencies:\n  flutter:\n    sdk: flutter\n"
    )
    assert only_requirement(tmp_path).argv == ("flutter", "test")


def test_dart_when_pubspec_has_no_flutter(tmp_path):
    write_workspace_file(tmp_path, "pubspec.yaml", "name: x\ndependencies:\n  http: ^1.0.0\n")
    assert only_requirement(tmp_path).argv == ("dart", "test")


def test_elixir_mix(tmp_path):
    write_workspace_file(tmp_path, "mix.exs")
    req = only_requirement(tmp_path)
    assert req.argv == ("mix", "test")
    assert "mix.exs" in req.influences


def test_haskell_prefers_stack_then_cabal(tmp_path):
    stack = tmp_path / "stack"
    write_workspace_file(stack, "stack.yaml")
    assert only_requirement(stack).argv == ("stack", "test")
    cabal = tmp_path / "cabal"
    write_workspace_file(cabal, "my.cabal")
    assert only_requirement(cabal).argv == ("cabal", "test")


def test_php_composer_test_script(tmp_path):
    write_workspace_file(tmp_path, "composer.json", json.dumps({"scripts": {"test": "phpunit"}}))
    req = only_requirement(tmp_path)
    assert req.argv == ("composer", "test")
    assert req.source == "project_manifest"
    assert req.runs == "phpunit"
    assert "composer.json" in req.influences


def test_php_unsafe_composer_script_marked_unsafe(tmp_path):
    write_workspace_file(
        tmp_path, "composer.json", json.dumps({"scripts": {"test": "rm -rf / && phpunit"}})
    )
    result = detect_verification_requirements(str(tmp_path))
    (req,) = result.requirements
    assert req.safe is False and "high-risk" in req.unsafe_reason
    assert result.safe_requirements == []


def test_php_phpunit_config_without_script(tmp_path):
    write_workspace_file(tmp_path, "phpunit.xml.dist")
    req = only_requirement(tmp_path)
    assert req.argv == ("vendor/bin/phpunit",)
    assert req.source == "project_configuration"


def test_ruby_rspec_with_bundler(tmp_path):
    write_workspace_file(tmp_path, "Gemfile", 'gem "rspec"')
    write_workspace_file(tmp_path, ".rspec")
    req = only_requirement(tmp_path)
    assert req.argv == ("bundle", "exec", "rspec")
    assert "Gemfile" in req.influences


def test_ruby_rake_task_without_bundler(tmp_path):
    write_workspace_file(tmp_path, "Rakefile", "task :test do\nend\n")
    assert only_requirement(tmp_path).argv == ("rake", "test")


def test_shell_bats_and_optional_shellcheck(tmp_path):
    write_workspace_file(tmp_path, "tests/basic.bats", "@test 'ok' {\n  true\n}\n")
    write_workspace_file(tmp_path, "run.sh", "echo hi\n")
    reqs = detect_verification_requirements(str(tmp_path)).requirements
    by_kind = {r.kind: r for r in reqs}
    assert by_kind["tests"].argv == ("bats", "-r", "tests")
    assert by_kind["lint"].argv[0] == "shellcheck" and by_kind["lint"].required is False


def test_solidity_foundry(tmp_path):
    write_workspace_file(tmp_path, "foundry.toml")
    req = only_requirement(tmp_path)
    assert req.argv == ("forge", "test")
    assert "foundry.toml" in req.influences
