"""DeepSeek-powered DocGen assistant service."""

from __future__ import annotations

import json
import os
import re
from collections import Counter
from typing import Any

import httpx
from fastapi import HTTPException

from ..docgen import build_traceability
from ..repository_contract import RepositoryStore


class AiDocgenService:
    def __init__(self, store: RepositoryStore) -> None:
        self.store = store

    async def draft_docgen_template(
        self,
        project_id: str,
        branch: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        settings = self._settings()
        if not settings["api_key"]:
            raise HTTPException(
                status_code=503,
                detail="DeepSeek is not configured. Set DEEPSEEK_API_KEY before using the DocGen agent.",
            )

        project = self.store.get_project(project_id)
        branch_payload = self.store.get_branch(project_id, branch)
        element_map = branch_payload.get("elements", {})
        elements = list(element_map.values())
        traceability = build_traceability(element_map)
        validation = self.store.validate_branch(project_id, branch)
        mode = payload.get("mode", "full")
        current_template = str(payload.get("template") or "")

        prompt = self._build_prompt(project, branch, elements, traceability, validation, mode, current_template)
        draft = self._extract_markdown(await self._chat(prompt, settings))
        return {
            "template": draft,
            "model": settings["model"],
            "mode": mode,
            "summary": self._model_summary(elements, validation),
        }

    async def review_model(self, project_id: str, branch: str, payload: dict[str, Any]) -> dict[str, Any]:
        settings = self._settings()
        if not settings["api_key"]:
            raise HTTPException(
                status_code=503,
                detail="DeepSeek is not configured. Set DEEPSEEK_API_KEY before using the VE review agent.",
            )

        project = self.store.get_project(project_id)
        branch_payload = self.store.get_branch(project_id, branch)
        element_map = branch_payload.get("elements", {})
        elements = list(element_map.values())
        traceability = build_traceability(element_map)
        validation = self.store.validate_branch(project_id, branch)
        selected_id = str(payload.get("selected_id") or "")

        prompt = self._build_review_prompt(project, branch, elements, traceability, validation, selected_id)
        review = self._extract_markdown(await self._chat(prompt, settings))
        return {
            "review": review,
            "model": settings["model"],
            "summary": self._model_summary(elements, validation),
        }

    async def suggest_requirement_closure(
        self, project_id: str, branch: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        settings = self._settings()
        if not settings["api_key"]:
            raise HTTPException(
                status_code=503,
                detail="DeepSeek is not configured. Set DEEPSEEK_API_KEY before using the closure suggestion agent.",
            )

        project = self.store.get_project(project_id)
        branch_payload = self.store.get_branch(project_id, branch)
        element_map = branch_payload.get("elements", {})
        elements = list(element_map.values())
        traceability = build_traceability(element_map)
        validation = self.store.validate_branch(project_id, branch)
        selected_id = str(payload.get("selected_id") or "")
        limit = int(payload.get("limit") or 6)

        prompt = self._build_closure_prompt(project, branch, elements, traceability, validation, selected_id, limit)
        raw = self._extract_markdown(await self._chat(prompt, settings))
        suggestions = self._extract_json_payload(raw).get("suggestions", [])
        return {
            "suggestions": suggestions if isinstance(suggestions, list) else [],
            "raw": raw,
            "model": settings["model"],
            "summary": self._model_summary(elements, validation),
        }

    async def chat_about_model(self, project_id: str, branch: str, payload: dict[str, Any]) -> dict[str, Any]:
        settings = self._settings()
        if not settings["api_key"]:
            raise HTTPException(
                status_code=503,
                detail="DeepSeek is not configured. Set DEEPSEEK_API_KEY before using the model assistant.",
            )

        question = str(payload.get("question") or "").strip()
        if not question:
            raise HTTPException(status_code=400, detail="Question is required")

        project = self.store.get_project(project_id)
        branch_payload = self.store.get_branch(project_id, branch)
        element_map = branch_payload.get("elements", {})
        elements = list(element_map.values())
        traceability = build_traceability(element_map)
        validation = self.store.validate_branch(project_id, branch)
        history = payload.get("history") if isinstance(payload.get("history"), list) else []
        retrieval = self._retrieve_model_context(question, element_map, traceability, validation, limit=10)

        prompt = self._build_chat_prompt(project, branch, elements, traceability, validation, question, history, retrieval)
        answer = self._extract_markdown(await self._chat(prompt, settings))
        return {
            "answer": answer,
            "model": settings["model"],
            "summary": self._model_summary(elements, validation),
            "retrieval": retrieval,
        }

    async def analyze_version_impact(self, project_id: str, branch: str, payload: dict[str, Any]) -> dict[str, Any]:
        settings = self._settings()
        if not settings["api_key"]:
            raise HTTPException(
                status_code=503,
                detail="DeepSeek is not configured. Set DEEPSEEK_API_KEY before using the version impact agent.",
            )

        from_ref = str(payload.get("from") or payload.get("from_ref") or "working")
        to_ref = str(payload.get("to") or payload.get("to_ref") or "working")
        project = self.store.get_project(project_id)
        branch_payload = self.store.get_branch(project_id, branch)
        element_map = branch_payload.get("elements", {})
        elements = list(element_map.values())
        traceability = build_traceability(element_map)
        validation = self.store.validate_branch(project_id, branch)
        diff = self.store.diff_commits(project_id, branch, from_ref, to_ref)

        prompt = self._build_impact_prompt(project, branch, diff, traceability, validation, elements)
        analysis = self._extract_markdown(await self._chat(prompt, settings))
        return {
            "analysis": analysis,
            "model": settings["model"],
            "from": diff.get("from", from_ref),
            "to": diff.get("to", to_ref),
            "summary": self._model_summary(elements, validation),
        }

    async def review_document_quality(
        self,
        project_id: str,
        branch: str,
        document_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        settings = self._settings()
        if not settings["api_key"]:
            raise HTTPException(
                status_code=503,
                detail="DeepSeek is not configured. Set DEEPSEEK_API_KEY before using the document quality agent.",
            )

        project = self.store.get_project(project_id)
        branch_payload = self.store.get_branch(project_id, branch)
        element_map = branch_payload.get("elements", {})
        elements = list(element_map.values())
        traceability = build_traceability(element_map)
        validation = self.store.validate_branch(project_id, branch)
        document = self.store.get_document(project_id, branch, document_id)

        prompt = self._build_document_quality_prompt(project, branch, document, traceability, validation, elements)
        review = self._extract_markdown(await self._chat(prompt, settings))
        return {
            "review": review,
            "model": settings["model"],
            "document_id": document_id,
            "summary": self._model_summary(elements, validation),
        }

    def _settings(self) -> dict[str, Any]:
        return {
            "api_key": os.environ.get("DEEPSEEK_API_KEY", "").strip(),
            "base_url": os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/"),
            "model": os.environ.get("DEEPSEEK_MODEL", "deepseek-chat").strip() or "deepseek-chat",
            "timeout": float(os.environ.get("DEEPSEEK_TIMEOUT", "45")),
        }

    async def _chat(self, prompt: str, settings: dict[str, Any]) -> str:
        url = f"{settings['base_url']}/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings['api_key']}",
            "Content-Type": "application/json",
        }
        body = {
            "model": settings["model"],
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a SysML DocGen assistant for a model-based systems engineering system. "
                        "Return concise Markdown or the requested JSON only. Use supplied SysML context and do not invent element IDs."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.35,
            "stream": False,
        }
        try:
            async with httpx.AsyncClient(timeout=settings["timeout"]) as client:
                response = await client.post(url, headers=headers, json=body)
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:600]
            raise HTTPException(status_code=502, detail=f"DeepSeek API error: {detail}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Cannot reach DeepSeek API: {exc}") from exc

        data = response.json()
        try:
            return str(data["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError) as exc:
            raise HTTPException(status_code=502, detail="DeepSeek returned an unexpected response shape") from exc

    def _build_prompt(
        self,
        project: dict[str, Any],
        branch: str,
        elements: list[dict[str, Any]],
        traceability: list[dict[str, Any]],
        validation: dict[str, Any],
        mode: str,
        current_template: str,
    ) -> str:
        compact_elements = [self._compact_element(item) for item in elements[:80]]
        context = {
            "project": self._project_context(project, branch),
            "model_summary": self._model_summary(elements, validation),
            "traceability": traceability[:40],
            "validation": validation,
            "sample_elements": compact_elements,
        }
        task = {
            "full": "Generate a complete engineering document template with chapters, summary, traceability explanation, and review comments.",
            "summary": "Generate a concise project summary and model overview section.",
            "trace": "Generate a traceability explanation section and keep the traceability matrix placeholder.",
            "review": "Generate model review comments and validation-oriented recommendations.",
        }.get(mode, "Generate a complete engineering document template.")
        return (
            f"{task}\n\n"
            "Use Chinese section titles and readable engineering prose.\n"
            "Keep these DocGen placeholders when relevant: {{model:summary}}, {{table:requirements}}, "
            "{{table:blocks}}, {{table:interfaces}}, {{table:constraints}}, {{table:tests}}, "
            "{{trace:matrix}}, {{validation:issues}}.\n"
            "Do not invent element IDs. Return only Markdown, no explanation outside the template.\n\n"
            f"Current template, if improving it:\n{current_template[:4000]}\n\n"
            f"Model context JSON:\n{json.dumps(context, ensure_ascii=False, indent=2)[:12000]}"
        )

    def _build_review_prompt(
        self,
        project: dict[str, Any],
        branch: str,
        elements: list[dict[str, Any]],
        traceability: list[dict[str, Any]],
        validation: dict[str, Any],
        selected_id: str,
    ) -> str:
        context = {
            "project": self._project_context(project, branch),
            "selected_id": selected_id,
            "model_summary": self._model_summary(elements, validation),
            "traceability": traceability[:60],
            "validation": validation,
            "elements": [self._compact_element(item) for item in elements[:100]],
        }
        return (
            "你是 VE 模型审查智能体，请对当前 SysML 模型做只读审查。"
            "重点检查需求清晰度、satisfy/verify 闭环、模块接口关系、约束和测试覆盖。\n"
            "请输出中文 Markdown，结构固定为：\n"
            "## 总体评价\n## 关键问题\n## 追踪闭环建议\n## 元素级修改建议\n## 下一步行动\n"
            "不要编造不存在的元素 ID，不要输出 JSON，所有建议必须由工程师确认后执行。\n\n"
            f"模型上下文 JSON:\n{json.dumps(context, ensure_ascii=False, indent=2)[:14000]}"
        )

    def _build_closure_prompt(
        self,
        project: dict[str, Any],
        branch: str,
        elements: list[dict[str, Any]],
        traceability: list[dict[str, Any]],
        validation: dict[str, Any],
        selected_id: str,
        limit: int,
    ) -> str:
        open_rows = [row for row in traceability if row.get("status") != "closed"]
        if selected_id:
            open_rows = [
                row
                for row in traceability
                if row.get("requirement", {}).get("id") == selected_id or row.get("status") != "closed"
            ]
        context = {
            "project": self._project_context(project, branch),
            "selected_id": selected_id,
            "model_summary": self._model_summary(elements, validation),
            "open_or_partial_traceability": open_rows[: max(1, limit)],
            "validation": validation,
            "candidate_elements": [
                self._compact_element(item)
                for item in elements
                if item.get("type") in {"Requirement", "Block", "Constraint", "TestCase"}
            ][:120],
        }
        return (
            "You are a SysML requirement traceability closure assistant. "
            "Return JSON only, without Markdown fences or extra prose. "
            "Analyze open or partial Requirement rows and propose candidate SysML elements and relations. "
            "Use existing IDs only when referencing existing elements. For new elements, generate IDs with prefixes TST-AI- or CST-AI-. "
            "The response schema must be exactly:\n"
            '{"suggestions":[{"requirement_id":"REQ-...","requirement_name":"...","status":"open|partial",'
            '"missing":["TestCase","Constraint","satisfy"],"rationale":"Chinese explanation",'
            '"suggested_test_case":{"id":"TST-AI-001","type":"TestCase","name":"...","description":"...",'
            '"attributes":{},"relations":[{"type":"verify","target":"REQ-..."}]},'
            '"suggested_constraint":{"id":"CST-AI-001","type":"Constraint","name":"...","description":"...",'
            '"attributes":{"expression":"..."},"relations":[{"type":"constrain","target":"REQ-..."}]},'
            '"suggested_relations":[{"type":"verify","target":"REQ-..."}]}]}\n\n'
            f"Context JSON:\n{json.dumps(context, ensure_ascii=False, indent=2)[:18000]}"
        )

    def _build_chat_prompt(
        self,
        project: dict[str, Any],
        branch: str,
        elements: list[dict[str, Any]],
        traceability: list[dict[str, Any]],
        validation: dict[str, Any],
        question: str,
        history: list[Any],
        retrieval: dict[str, Any],
    ) -> str:
        compact_history = [
            {
                "role": item.get("role"),
                "content": str(item.get("content") or "")[:1200],
            }
            for item in history[-6:]
            if isinstance(item, dict) and item.get("role") in {"user", "assistant"}
        ]
        context = {
            "project": self._project_context(project, branch),
            "model_summary": self._model_summary(elements, validation),
            "retrieved_context": retrieval,
            "traceability_summary": {
                "total": len(traceability),
                "open_or_partial": sum(1 for row in traceability if row.get("status") != "closed"),
            },
            "validation_summary": validation.get("summary", {}),
            "chat_history": compact_history,
        }
        return (
            "你是一个接入 RAG 检索的 SysML 模型问答助手。请使用中文 Markdown 回答。"
            "只能依据 retrieved_context 和 summary 中的模型数据，不要编造不存在的元素 ID。"
            "回答第一句话必须以 `RAG 命中:` 开头，说明本次检索命中了哪些模型证据。"
            "后续固定使用三个小节：## 结论、## 依据、## 建议。"
            "不要输出隐藏推理链。\n\n"
            f"用户问题:\n{question}\n\n"
            f"RAG context JSON:\n{json.dumps(context, ensure_ascii=False, indent=2)[:18000]}"
        )

    def _build_impact_prompt(
        self,
        project: dict[str, Any],
        branch: str,
        diff: dict[str, Any],
        traceability: list[dict[str, Any]],
        validation: dict[str, Any],
        elements: list[dict[str, Any]],
    ) -> str:
        context = {
            "project": self._project_context(project, branch),
            "diff": diff,
            "traceability": traceability[:80],
            "validation": validation,
            "model_summary": self._model_summary(elements, validation),
        }
        return (
            "You are a systems engineering change-impact analysis agent. "
            "Write the final answer in Chinese Markdown. Focus on requirements, blocks, interfaces, "
            "constraints, test cases, traceability closure, document regeneration risk, and suggested review actions. "
            "Use this exact structure:\n"
            "## 影响摘要\n## 受影响范围\n## 追踪闭环风险\n## 文档再生成风险\n## 建议审查动作\n"
            "Do not invent element IDs.\n\n"
            f"Context JSON:\n{json.dumps(context, ensure_ascii=False, indent=2)[:18000]}"
        )

    def _build_document_quality_prompt(
        self,
        project: dict[str, Any],
        branch: str,
        document: dict[str, Any],
        traceability: list[dict[str, Any]],
        validation: dict[str, Any],
        elements: list[dict[str, Any]],
    ) -> str:
        context = {
            "project": self._project_context(project, branch),
            "document": {
                "id": document.get("id"),
                "title": document.get("title"),
                "created_at": document.get("created_at"),
                "source_commit": document.get("source_commit"),
                "model_hash": document.get("model_hash"),
                "markdown": str(document.get("markdown") or "")[:12000],
            },
            "traceability": traceability[:80],
            "validation": validation,
            "model_summary": self._model_summary(elements, validation),
        }
        return (
            "You are a document quality reviewer for a SysML-based automatic documentation system. "
            "Write the final answer in Chinese Markdown. Score the generated document against the model context, "
            "traceability, completeness, consistency, readability, and review readiness. "
            "Use this exact structure:\n"
            "## 质量评分\n## 覆盖性检查\n## 一致性风险\n## 可读性建议\n## 发布前检查清单\n"
            "Give a numeric score from 0 to 100. Do not invent model data or element IDs.\n\n"
            f"Context JSON:\n{json.dumps(context, ensure_ascii=False, indent=2)[:18000]}"
        )

    def _retrieve_model_context(
        self,
        question: str,
        elements: dict[str, Any],
        traceability: list[dict[str, Any]],
        validation: dict[str, Any],
        limit: int = 10,
    ) -> dict[str, Any]:
        tokens = self._tokenize_query(question)
        question_lower = question.lower()
        asks_requirement_closure = any(
            word in question_lower
            for word in ("需求", "requirement", "验证", "verify", "闭环", "trace", "追踪")
        )

        scored_elements = []
        for element in elements.values():
            score = self._score_text(self._element_search_text(element), tokens)
            element_type = str(element.get("type", "")).lower()
            if asks_requirement_closure and element_type == "requirement":
                score += 6
            if ("测试" in question_lower or "test" in question_lower or "验证" in question_lower) and element_type == "testcase":
                score += 4
            if ("约束" in question_lower or "constraint" in question_lower) and element_type == "constraint":
                score += 4
            if score > 0:
                scored_elements.append((score, element))
        scored_elements.sort(key=lambda item: item[0], reverse=True)

        top_elements = [
            {"score": score, **self._compact_element(item)}
            for score, item in scored_elements[:limit]
        ]
        selected_ids = {str(item.get("id")) for item in top_elements if item.get("id")}

        scored_trace_rows = []
        for row in traceability:
            score = self._score_text(json.dumps(row, ensure_ascii=False), tokens)
            status = str(row.get("status", ""))
            requirement_id = str(row.get("requirement", {}).get("id", ""))
            if asks_requirement_closure:
                score += 8
                if status != "closed":
                    score += 6
            if requirement_id in selected_ids:
                score += 5
            for key in ("satisfied_by", "verified_by", "refined_by", "constrained_by"):
                for ref in row.get(key, []) or []:
                    if str(ref.get("id", "")) in selected_ids:
                        score += 3
            if score > 0:
                scored_trace_rows.append((score, row))
        scored_trace_rows.sort(key=lambda item: item[0], reverse=True)

        scored_issues = []
        for issue in validation.get("issues", [])[:80]:
            score = self._score_text(json.dumps(issue, ensure_ascii=False), tokens)
            if str(issue.get("element_id", "")) in selected_ids:
                score += 4
            if score > 0:
                scored_issues.append((score, issue))
        scored_issues.sort(key=lambda item: item[0], reverse=True)

        references = [
            {
                "kind": "element",
                "id": str(item.get("id", "")),
                "label": f"{item.get('id', '')} / {item.get('type', '')}",
                "score": score,
            }
            for score, item in scored_elements[:limit]
        ]
        references.extend(
            {
                "kind": "traceability",
                "id": str(row.get("requirement", {}).get("id", "")),
                "label": f"{row.get('requirement', {}).get('id', '')} trace / {row.get('status', '')}",
                "score": score,
            }
            for score, row in scored_trace_rows[:8]
        )
        references.extend(
            {
                "kind": "validation",
                "id": str(issue.get("element_id", "")),
                "label": f"{issue.get('severity', '')} / {issue.get('element_id', '')}",
                "score": score,
            }
            for score, issue in scored_issues[:6]
        )

        return {
            "query_tokens": tokens[:24],
            "elements": top_elements,
            "traceability": [{"score": score, **row} for score, row in scored_trace_rows[:8]],
            "validation_issues": [{"score": score, **issue} for score, issue in scored_issues[:8]],
            "references": references[:18],
        }

    def _compact_element(self, element: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": element.get("id"),
            "type": element.get("type"),
            "name": element.get("name"),
            "description": element.get("description", ""),
            "owner": element.get("owner", ""),
            "relations": element.get("relations", [])[:8],
            "attributes": element.get("attributes", {}),
        }

    def _project_context(self, project: dict[str, Any], branch: str) -> dict[str, Any]:
        return {
            "id": project.get("id"),
            "name": project.get("name"),
            "description": project.get("description", ""),
            "organization": project.get("organization", ""),
            "branch": branch,
        }

    def _element_search_text(self, element: dict[str, Any]) -> str:
        return " ".join(
            [
                str(element.get("id", "")),
                str(element.get("type", "")),
                str(element.get("name", "")),
                str(element.get("description", "")),
                json.dumps(element.get("attributes", {}), ensure_ascii=False),
                json.dumps(element.get("relations", []), ensure_ascii=False),
            ]
        ).lower()

    def _tokenize_query(self, text: str) -> list[str]:
        raw_tokens = re.findall(r"[A-Za-z0-9_-]+|[\u4e00-\u9fff]{2,4}", text.lower())
        stopwords = {"the", "and", "for", "with", "this", "that", "什么", "哪些", "一下", "当前", "模型", "是否", "还有"}
        tokens = [token for token in raw_tokens if token and token not in stopwords]
        lower = text.lower()
        domain_tokens: list[str] = []
        if "需求" in text or "requirement" in lower:
            domain_tokens.extend(["需求", "requirement", "req"])
        if "验证" in text or "闭环" in text or "verify" in lower:
            domain_tokens.extend(["验证", "闭环", "verify", "verified_by", "testcase", "closed", "partial", "open"])
        if "测试" in text or "test" in lower:
            domain_tokens.extend(["测试", "testcase", "verify", "verified_by"])
        if "约束" in text or "constraint" in lower:
            domain_tokens.extend(["约束", "constraint", "constrain"])
        if "追踪" in text or "trace" in lower:
            domain_tokens.extend(["追踪", "traceability", "satisfy", "verify", "refine"])
        tokens.extend(domain_tokens)
        return list(dict.fromkeys(tokens)) or [text.lower().strip()]

    def _score_text(self, text: str, tokens: list[str]) -> int:
        value = text.lower()
        score = 0
        for token in tokens:
            count = value.count(token)
            if count:
                score += count * (4 if len(token) >= 4 else 2)
        return score

    def _model_summary(self, elements: list[dict[str, Any]], validation: dict[str, Any]) -> dict[str, Any]:
        counts = Counter(str(item.get("type", "Unknown")) for item in elements)
        return {
            "element_count": len(elements),
            "type_counts": dict(counts),
            "validation": validation.get("summary", {}),
        }

    def _extract_markdown(self, content: str) -> str:
        text = content.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        return text

    def _extract_json_payload(self, content: str) -> dict[str, Any]:
        text = self._extract_markdown(content)
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if not match:
                return {}
            try:
                parsed = json.loads(match.group(0))
                return parsed if isinstance(parsed, dict) else {}
            except json.JSONDecodeError:
                return {}
