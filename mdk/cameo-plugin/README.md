# SysML DocGen Cameo MDK Plugin

This directory contains a Cameo/MagicDraw plugin scaffold for the MDK layer.

It maps the detailed-design MDK functions to the FastAPI service:

- `parse_sysml(file_path)` -> local XMI export parsing before push
- `mdk_push_model(model, username)` -> `POST /api/mdk/push`
- `mdk_pull_model(model_name)` -> `GET /api/mdk/pull`
- `mdk_generate_doc(model_name, doc_type)` -> `POST /api/mdk/generate`

The Java sources are intentionally small and dependency-light. In a real Cameo
installation, copy this plugin folder into the Cameo `plugins` directory and add
the Cameo OpenAPI jars to the Gradle compile classpath.

By default the scaffold sends requests as the demo author `engineer`. You can
override this with the JVM property `-Dsysml.docgen.user=<username>` after adding
that user to the target project's `author` or `admin` role list.
