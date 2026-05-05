const defaultTemplate = `# {{element:REQ-001.name}} 设计文档

## 1. 模型概览

{{model:summary}}

## 2. 需求基线

{{table:requirements}}

## 3. 系统结构

{{table:blocks}}

## 4. 接口与端口

{{table:interfaces}}

## 5. 约束与验证

{{table:constraints}}

{{table:tests}}

## 6. 追踪矩阵

{{trace:matrix}}

## 7. SysML 语义校验

{{validation:issues}}
`;

const state = {
  projects: [],
  project: null,
  branches: [],
  branch: "main",
  elements: [],
  selectedId: null,
  currentDocument: null,
  metamodel: null,
  commits: [],
  token: localStorage.getItem("sysml_token") || "",
  identity: JSON.parse(localStorage.getItem("sysml_identity") || "null"),
};

const els = Object.fromEntries(
  [
    "projectSelect",
    "branchSelect",
    "roleSelect",
    "usernameInput",
    "passwordInput",
    "loginButton",
    "logoutButton",
    "identityText",
    "projectTitle",
    "projectMeta",
    "stats",
    "elementList",
    "elementForm",
    "elementId",
    "elementType",
    "elementName",
    "elementOwner",
    "elementStereotype",
    "elementDescription",
    "elementAttributes",
    "elementRelations",
    "typeFilter",
    "searchInput",
    "newElementButton",
    "deleteElementButton",
    "resetElementButton",
    "commitButton",
    "exportButton",
    "validateButton",
    "validationResults",
    "diagramTypeSelect",
    "relationSourceSelect",
    "relationTypeSelect",
    "relationTargetSelect",
    "addRelationButton",
    "refreshDiagramButton",
    "diagramTitle",
    "diagramCanvas",
    "modelTree",
    "viewFrame",
    "refreshViewButton",
    "generateFromViewButton",
    "traceMatrix",
    "refreshTraceButton",
    "refreshVersionButton",
    "diffFromSelect",
    "diffToSelect",
    "runDiffButton",
    "rollbackCommitSelect",
    "rollbackButton",
    "newBranchInput",
    "createBranchButton",
    "mergeSourceSelect",
    "forceMergeInput",
    "mergeBranchButton",
    "diffSummary",
    "diffResults",
    "commitList",
    "auditList",
    "templateInput",
    "resetTemplateButton",
    "generateDocumentButton",
    "downloadMarkdownButton",
    "downloadHtmlButton",
    "downloadPdfButton",
    "documentFrame",
    "documentStatus",
    "documentList",
    "toast",
  ].map((id) => [id, document.querySelector(`#${id}`)]),
);

init().catch((error) => showToast(error.message, true));

async function init() {
  bindEvents();
  updateIdentityUI();
  els.templateInput.value = defaultTemplate;
  await loadMetamodel();
  await loadProjects();
}

function bindEvents() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  els.loginButton.addEventListener("click", loginUser);
  els.logoutButton.addEventListener("click", logoutUser);

  els.projectSelect.addEventListener("change", async () => {
    state.project = state.projects.find((project) => project.id === els.projectSelect.value);
    state.branch = "main";
    await loadBranches();
    await loadElements();
  });

  els.branchSelect.addEventListener("change", async () => {
    state.branch = els.branchSelect.value;
    state.selectedId = null;
    await loadElements();
  });

  els.typeFilter.addEventListener("change", () => loadElements());
  els.searchInput.addEventListener("input", debounce(() => loadElements(), 220));
  els.newElementButton.addEventListener("click", () => clearForm());
  els.resetElementButton.addEventListener("click", () => fillForm(currentElement() || blankElement()));
  els.deleteElementButton.addEventListener("click", deleteSelectedElement);
  els.elementType.addEventListener("change", updateFormDefaultsForType);
  els.elementForm.addEventListener("submit", saveElement);
  els.commitButton.addEventListener("click", saveCommit);
  els.exportButton.addEventListener("click", exportModel);
  els.validateButton.addEventListener("click", () => loadValidation());
  els.refreshDiagramButton.addEventListener("click", loadDiagram);
  els.diagramTypeSelect.addEventListener("change", loadDiagram);
  els.addRelationButton.addEventListener("click", addGraphRelation);
  els.refreshViewButton.addEventListener("click", renderModelView);
  els.generateFromViewButton.addEventListener("click", generateDocument);
  els.refreshTraceButton.addEventListener("click", loadTraceability);
  els.refreshVersionButton.addEventListener("click", loadVersionData);
  els.runDiffButton.addEventListener("click", runDiff);
  els.rollbackButton.addEventListener("click", rollbackToCommit);
  els.createBranchButton.addEventListener("click", createBranch);
  els.mergeBranchButton.addEventListener("click", mergeBranch);
  els.resetTemplateButton.addEventListener("click", () => {
    els.templateInput.value = defaultTemplate;
    showToast("模板已恢复");
  });
  els.generateDocumentButton.addEventListener("click", generateDocument);
  els.downloadMarkdownButton.addEventListener("click", () => downloadCurrent("markdown"));
  els.downloadHtmlButton.addEventListener("click", () => downloadCurrent("html"));
  els.downloadPdfButton.addEventListener("click", () => downloadCurrent("pdf"));
}

async function loginUser() {
  try {
    const payload = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: els.usernameInput.value.trim(),
        password: els.passwordInput.value,
      }),
      skipAuth: true,
    });
    state.identity = payload.identity;
    state.token = payload.identity.token;
    localStorage.setItem("sysml_token", state.token);
    localStorage.setItem("sysml_identity", JSON.stringify(state.identity));
    els.roleSelect.value = state.identity.role;
    updateIdentityUI();
    await loadProjects();
    showToast(`已登录：${state.identity.username}`);
  } catch (error) {
    showToast(error.message, true);
  }
}

function logoutUser() {
  state.identity = null;
  state.token = "";
  localStorage.removeItem("sysml_token");
  localStorage.removeItem("sysml_identity");
  updateIdentityUI();
  showToast("已退出登录");
}

function updateIdentityUI() {
  if (state.identity?.username) {
    els.identityText.textContent = `${state.identity.display || state.identity.username} · ${state.identity.role}`;
    els.logoutButton.disabled = false;
  } else {
    els.identityText.textContent = "未登录，使用请求头模拟权限";
    els.logoutButton.disabled = true;
  }
}

function switchView(viewId) {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewId);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });
  if (viewId === "diagramView") loadDiagram();
  if (viewId === "traceView") loadTraceability();
  if (viewId === "viewEditor") renderModelView();
  if (viewId === "versionView") loadVersionData();
  if (viewId === "docgenView") loadDocuments();
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-User": state.identity?.username || "engineer",
    "X-Role": state.identity?.role || els.roleSelect.value,
    ...(options.headers || {}),
  };
  if (state.token && !options.skipAuth) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      message = await response.text();
    }
    throw new Error(message);
  }
  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

async function loadMetamodel() {
  state.metamodel = await api("/api/metamodel");
  populateMetamodelControls();
}

function populateMetamodelControls() {
  const typeOptions = Object.keys(state.metamodel.types)
    .map((type) => `<option value="${escapeAttr(type)}">${escapeHtml(type)}</option>`)
    .join("");
  els.typeFilter.innerHTML = `<option value="">全部类型</option>${typeOptions}`;
  els.elementType.innerHTML = typeOptions;
  els.relationTypeSelect.innerHTML = Object.keys(state.metamodel.relation_labels)
    .map((type) => `<option value="${escapeAttr(type)}">${escapeHtml(type)}</option>`)
    .join("");
  els.diagramTypeSelect.innerHTML = Object.entries(state.metamodel.diagram_types)
    .map(([key, value]) => `<option value="${escapeAttr(key)}">${escapeHtml(value.label)}</option>`)
    .join("");
}

async function loadProjects() {
  const payload = await api("/api/projects");
  state.projects = payload.projects;
  if (!state.projects.length) {
    showToast("没有可用项目", true);
    return;
  }
  state.project = state.projects.find((project) => project.id === state.project?.id) || state.projects[0];
  els.projectSelect.innerHTML = state.projects
    .map((project) => `<option value="${escapeAttr(project.id)}">${escapeHtml(project.name)}</option>`)
    .join("");
  els.projectSelect.value = state.project.id;
  await loadBranches();
  await loadElements();
}

async function loadBranches() {
  if (!state.project) return;
  const payload = await api(`/api/projects/${encodeURIComponent(state.project.id)}/branches`);
  state.branches = payload.branches;
  if (!state.branches.find((branch) => branch.name === state.branch)) {
    state.branch = state.branches[0]?.name || "main";
  }
  els.branchSelect.innerHTML = state.branches
    .map((branch) => `<option value="${escapeAttr(branch.name)}">${escapeHtml(branch.name)}</option>`)
    .join("");
  els.branchSelect.value = state.branch;
  renderHeader();
}

async function loadElements() {
  if (!state.project) return;
  const params = new URLSearchParams();
  if (els.typeFilter.value) params.set("type", els.typeFilter.value);
  if (els.searchInput.value.trim()) params.set("q", els.searchInput.value.trim());
  const payload = await api(
    `/api/projects/${encodeURIComponent(state.project.id)}/branches/${encodeURIComponent(state.branch)}/elements?${params}`,
  );
  state.elements = payload.elements;
  if (!state.selectedId || !state.elements.some((element) => element.id === state.selectedId)) {
    state.selectedId = state.elements[0]?.id || null;
  }
  renderHeader();
  renderStats();
  renderElementList();
  renderRelationControls();
  fillForm(currentElement() || blankElement());
  renderModelView();
  await loadValidation();
}

function renderHeader() {
  if (!state.project) return;
  els.projectTitle.textContent = state.project.name;
  const branch = state.branches.find((item) => item.name === state.branch);
  els.projectMeta.textContent = `${state.project.organization || "课程设计小组"} · ${state.branch} · ${branch?.head || "working"}`;
}

function renderStats() {
  const counts = state.elements.reduce((acc, element) => {
    acc[element.type] = (acc[element.type] || 0) + 1;
    return acc;
  }, {});
  const stats = [
    ["模型元素", state.elements.length],
    ["需求", counts.Requirement || 0],
    ["结构块", counts.Block || 0],
    ["接口/端口", (counts.Interface || 0) + (counts.Port || 0)],
  ];
  els.stats.innerHTML = stats
    .map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderElementList() {
  if (!state.elements.length) {
    els.elementList.innerHTML = `<div class="empty-state">当前筛选条件下没有模型元素</div>`;
    return;
  }
  els.elementList.innerHTML = state.elements
    .map(
      (element) => `
        <button class="element-item ${element.id === state.selectedId ? "active" : ""}" data-id="${escapeAttr(element.id)}">
          <span class="element-id">${escapeHtml(element.id)}</span>
          <span class="element-name">${escapeHtml(element.name || "")}</span>
          <span class="type-badge">${escapeHtml(element.type || "")}</span>
        </button>
      `,
    )
    .join("");
  els.elementList.querySelectorAll(".element-item").forEach((item) => {
    item.addEventListener("click", () => {
      state.selectedId = item.dataset.id;
      renderElementList();
      fillForm(currentElement() || blankElement());
    });
  });
}

function renderRelationControls() {
  const options = state.elements
    .map((element) => `<option value="${escapeAttr(element.id)}">${escapeHtml(element.id)} · ${escapeHtml(element.name)}</option>`)
    .join("");
  els.relationSourceSelect.innerHTML = options;
  els.relationTargetSelect.innerHTML = options;
  if (state.selectedId) {
    els.relationSourceSelect.value = state.selectedId;
  }
}

function currentElement() {
  return state.elements.find((element) => element.id === state.selectedId);
}

function blankElement() {
  const type = els.elementType.value || "Requirement";
  return {
    id: "",
    type,
    name: "",
    stereotype: state.metamodel?.types[type]?.stereotype || type.toLowerCase(),
    owner: "",
    description: "",
    attributes: defaultAttributes(type),
    relations: [],
  };
}

function defaultAttributes(type) {
  const attrs = {};
  for (const key of state.metamodel?.types[type]?.required_attributes || []) {
    attrs[key] = "";
  }
  return attrs;
}

function clearForm() {
  state.selectedId = null;
  renderElementList();
  fillForm(blankElement());
  els.elementName.focus();
}

function fillForm(element) {
  els.elementId.value = element.id || "";
  els.elementType.value = element.type || "Requirement";
  els.elementName.value = element.name || "";
  els.elementOwner.value = element.owner || "";
  els.elementStereotype.value = element.stereotype || state.metamodel?.types[element.type]?.stereotype || "";
  els.elementDescription.value = element.description || "";
  els.elementAttributes.value = JSON.stringify(element.attributes || {}, null, 2);
  els.elementRelations.value = JSON.stringify(element.relations || [], null, 2);
  els.deleteElementButton.disabled = !element.id;
}

function updateFormDefaultsForType() {
  if (els.elementId.value.trim()) return;
  const type = els.elementType.value;
  els.elementStereotype.value = state.metamodel?.types[type]?.stereotype || type.toLowerCase();
  els.elementAttributes.value = JSON.stringify(defaultAttributes(type), null, 2);
}

async function saveElement(event) {
  event.preventDefault();
  try {
    const payload = {
      id: els.elementId.value.trim(),
      type: els.elementType.value,
      name: els.elementName.value.trim(),
      owner: els.elementOwner.value.trim(),
      stereotype: els.elementStereotype.value.trim(),
      description: els.elementDescription.value.trim(),
      attributes: parseJsonField(els.elementAttributes.value, "属性 JSON"),
      relations: parseJsonField(els.elementRelations.value, "关系 JSON"),
    };
    const isUpdate = Boolean(payload.id);
    const path = isUpdate
      ? `/api/projects/${encodeURIComponent(state.project.id)}/branches/${encodeURIComponent(state.branch)}/elements/${encodeURIComponent(payload.id)}`
      : `/api/projects/${encodeURIComponent(state.project.id)}/branches/${encodeURIComponent(state.branch)}/elements`;
    const method = isUpdate ? "PUT" : "POST";
    const result = await api(path, { method, body: JSON.stringify(payload) });
    state.selectedId = result.element.id;
    await loadElements();
    showToast("模型元素已保存");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deleteSelectedElement() {
  const element = currentElement();
  if (!element) return;
  const confirmed = window.confirm(`删除 ${element.id} ${element.name}？`);
  if (!confirmed) return;
  try {
    await api(
      `/api/projects/${encodeURIComponent(state.project.id)}/branches/${encodeURIComponent(state.branch)}/elements/${encodeURIComponent(element.id)}`,
      { method: "DELETE" },
    );
    state.selectedId = null;
    await loadElements();
    showToast("模型元素已删除");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function saveCommit() {
  const message = window.prompt("快照说明", "更新模型与文档视图");
  if (message === null) return;
  try {
    const result = await api(
      `/api/projects/${encodeURIComponent(state.project.id)}/branches/${encodeURIComponent(state.branch)}/commit`,
      { method: "POST", body: JSON.stringify({ message }) },
    );
    await loadBranches();
    showToast(`快照已保存：${result.commit.id}`);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function exportModel() {
  try {
    const useXmi = window.confirm("导出为 XMI？\n\n选择“确定”导出 XMI，选择“取消”导出 JSON。");
    const format = useXmi ? "xmi" : "json";
    const payload = await api(
      `/api/projects/${encodeURIComponent(state.project.id)}/branches/${encodeURIComponent(state.branch)}/export?format=${format}`,
    );
    if (useXmi) {
      downloadText(`${state.project.id}-${state.branch}-model.xmi`, payload, "application/xml");
      return;
    }
    downloadText(
      `${state.project.id}-${state.branch}-model.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadValidation() {
  if (!state.project) return;
  try {
    const payload = await api(
      `/api/projects/${encodeURIComponent(state.project.id)}/branches/${encodeURIComponent(state.branch)}/validate`,
    );
    renderValidation(payload);
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderValidation(payload) {
  const summary = payload.summary;
  if (!payload.issues.length) {
    els.validationResults.innerHTML = `<div class="empty-state">未发现语义校验问题</div>`;
    return;
  }
  els.validationResults.innerHTML = `
    <div class="validation-summary">
      <span>元素 ${summary.elements}</span>
      <span>错误 ${summary.errors}</span>
      <span>警告 ${summary.warnings}</span>
      <span>提示 ${summary.infos}</span>
    </div>
    ${payload.issues
      .map(
        (issue) => `
          <div class="validation-item ${escapeAttr(issue.severity)}">
            <strong>${escapeHtml(issue.severity)}</strong>
            <span>${escapeHtml(issue.element_id)}</span>
            <p>${escapeHtml(issue.message)}</p>
          </div>
        `,
      )
      .join("")}
  `;
}

async function loadDiagram() {
  if (!state.project) return;
  try {
    const params = new URLSearchParams({ type: els.diagramTypeSelect.value || "requirements" });
    const payload = await api(
      `/api/projects/${encodeURIComponent(state.project.id)}/branches/${encodeURIComponent(state.branch)}/diagram?${params}`,
    );
    renderDiagram(payload.diagram);
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderDiagram(diagram) {
  els.diagramTitle.textContent = diagram.label;
  if (!diagram.nodes.length) {
    els.diagramCanvas.innerHTML = `<div class="empty-state">当前图类型没有可显示的模型元素</div>`;
    return;
  }
  const nodeMap = Object.fromEntries(diagram.nodes.map((node) => [node.id, node]));
  const width = Math.max(980, ...diagram.nodes.map((node) => node.x + node.width + 70));
  const height = Math.max(560, ...diagram.nodes.map((node) => node.y + node.height + 70));
  const edges = diagram.edges
    .map((edge, index) => {
      const source = nodeMap[edge.source];
      const target = nodeMap[edge.target];
      if (!source || !target) return "";
      const x1 = source.x + source.width;
      const y1 = source.y + source.height / 2;
      const x2 = target.x;
      const y2 = target.y + target.height / 2;
      const bend = Math.max(24, Math.abs(x2 - x1) / 2);
      const path = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
      const labelX = (x1 + x2) / 2;
      const labelY = (y1 + y2) / 2 - 8 + (index % 3) * 12;
      return `
        <path d="${path}" class="diagram-edge" marker-end="url(#arrow)" />
        <text x="${labelX}" y="${labelY}" class="diagram-edge-label">${escapeSvg(edge.label || edge.type)}</text>
      `;
    })
    .join("");
  const nodes = diagram.nodes
    .map(
      (node) => `
        <g class="diagram-node" data-id="${escapeAttr(node.id)}">
          <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="8" />
          <text x="${node.x + 12}" y="${node.y + 24}" class="diagram-node-id">${escapeSvg(node.id)}</text>
          <text x="${node.x + 12}" y="${node.y + 44}" class="diagram-node-name">${escapeSvg(trimText(node.name, 18))}</text>
          <text x="${node.x + node.width - 12}" y="${node.y + 24}" class="diagram-node-type">${escapeSvg(node.label)}</text>
        </g>
      `,
    )
    .join("");
  els.diagramCanvas.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(diagram.label)}">
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill="#64748b"></path>
        </marker>
      </defs>
      ${edges}
      ${nodes}
    </svg>
  `;
  els.diagramCanvas.querySelectorAll(".diagram-node").forEach((node) => {
    node.addEventListener("click", () => {
      state.selectedId = node.dataset.id;
      switchView("modelView");
      renderElementList();
      fillForm(currentElement() || blankElement());
    });
  });
}

async function addGraphRelation() {
  const source = state.elements.find((element) => element.id === els.relationSourceSelect.value);
  const target = els.relationTargetSelect.value;
  const relationType = els.relationTypeSelect.value;
  if (!source || !target || !relationType) return;
  const relations = [...(source.relations || [])];
  if (relations.some((relation) => relation.type === relationType && relation.target === target)) {
    showToast("该关系已存在");
    return;
  }
  relations.push({ type: relationType, target });
  try {
    await api(
      `/api/projects/${encodeURIComponent(state.project.id)}/branches/${encodeURIComponent(state.branch)}/elements/${encodeURIComponent(source.id)}`,
      {
        method: "PUT",
        body: JSON.stringify({ ...source, relations }),
      },
    );
    await loadElements();
    await loadDiagram();
    showToast("关系已添加");
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderModelView() {
  renderModelTree();
  els.viewFrame.srcdoc = buildViewHtml();
}

function renderModelTree() {
  const groups = groupBy(state.elements, (element) => element.type || "Unknown");
  const order = Object.keys(state.metamodel?.types || {});
  els.modelTree.innerHTML = order
    .filter((type) => groups[type]?.length)
    .map(
      (type) => `
        <section class="tree-group">
          <h3>${escapeHtml(type)}</h3>
          ${groups[type]
            .map(
              (element) => `
                <div class="tree-node">
                  <span>${escapeHtml(element.id)}</span>
                  <span>${escapeHtml(element.name || "")}</span>
                </div>
              `,
            )
            .join("")}
        </section>
      `,
    )
    .join("");
}

function buildViewHtml() {
  const types = ["Requirement", "Block", "Interface", "Port", "Constraint", "Activity", "State", "TestCase"];
  const sections = types
    .map((type) => {
      const items = state.elements.filter((element) => element.type === type);
      return `<h2>${escapeHtml(type)}</h2>${viewTable(items)}`;
    })
    .join("");
  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 28px; font-family: "Microsoft YaHei", Arial, sans-serif; color: #172033; }
        h1 { margin: 0 0 18px; font-size: 25px; }
        h2 { margin: 28px 0 10px; font-size: 18px; color: #115e59; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 14px; }
        th, td { border: 1px solid #d8dee8; padding: 10px; text-align: left; vertical-align: top; }
        th { background: #eef6f7; }
        .muted { color: #627087; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(state.project?.name || "")}</h1>
      <p class="muted">分支 ${escapeHtml(state.branch)} · 元素 ${state.elements.length}</p>
      ${sections}
    </body>
  </html>`;
}

function viewTable(items) {
  if (!items.length) return `<p class="muted">无数据</p>`;
  return `<table>
    <thead><tr><th>ID</th><th>名称</th><th>责任域</th><th>描述</th></tr></thead>
    <tbody>
      ${items
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(item.id)}</td>
              <td>${escapeHtml(item.name || "")}</td>
              <td>${escapeHtml(item.owner || "")}</td>
              <td>${escapeHtml(item.description || "")}</td>
            </tr>
          `,
        )
        .join("")}
    </tbody>
  </table>`;
}

async function loadTraceability() {
  try {
    const payload = await api(
      `/api/projects/${encodeURIComponent(state.project.id)}/branches/${encodeURIComponent(state.branch)}/traceability`,
    );
    renderTraceability(payload.traceability);
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderTraceability(rows) {
  if (!rows.length) {
    els.traceMatrix.innerHTML = `<div class="empty-state">没有 Requirement 类型元素</div>`;
    return;
  }
  els.traceMatrix.innerHTML = `<table>
    <thead>
      <tr>
        <th>需求</th>
        <th>满足元素</th>
        <th>验证元素</th>
        <th>约束</th>
        <th>状态</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (row) => `
            <tr>
              <td><strong>${escapeHtml(row.requirement.id)}</strong><br>${escapeHtml(row.requirement.name)}</td>
              <td>${formatRefs(row.satisfied_by)}</td>
              <td>${formatRefs(row.verified_by)}</td>
              <td>${formatRefs(row.constrained_by || [])}</td>
              <td><span class="trace-status ${escapeAttr(row.status)}">${escapeHtml(row.status)}</span></td>
            </tr>
          `,
        )
        .join("")}
    </tbody>
  </table>`;
}

function formatRefs(refs) {
  if (!refs.length) return "-";
  return refs.map((item) => `<strong>${escapeHtml(item.id)}</strong> ${escapeHtml(item.name)}`).join("<br>");
}

async function loadVersionData() {
  if (!state.project) return;
  await Promise.all([loadCommits(), loadAudit()]);
  renderBranchControls();
}

async function loadCommits() {
  const payload = await api(`/api/projects/${encodeURIComponent(state.project.id)}/commits`);
  state.commits = payload.commits;
  const options = [
    `<option value="working">working</option>`,
    ...state.commits.map(
      (commit) => `<option value="${escapeAttr(commit.id)}">${escapeHtml(commit.id)} · ${escapeHtml(commit.message)}</option>`,
    ),
  ].join("");
  els.diffFromSelect.innerHTML = options;
  els.diffToSelect.innerHTML = options;
  els.rollbackCommitSelect.innerHTML = state.commits
    .map((commit) => `<option value="${escapeAttr(commit.id)}">${escapeHtml(commit.id)} · ${escapeHtml(commit.message)}</option>`)
    .join("");
  if (state.commits[1]) {
    els.diffFromSelect.value = state.commits[1].id;
  }
  els.diffToSelect.value = "working";
  renderCommitList();
}

function renderCommitList() {
  if (!state.commits.length) {
    els.commitList.innerHTML = `<div class="empty-state">暂无提交</div>`;
    return;
  }
  els.commitList.innerHTML = `
    <h3>提交记录</h3>
    ${state.commits
      .map(
        (commit) => `
          <div class="commit-item">
            <strong>${escapeHtml(commit.id)}</strong>
            <span>${escapeHtml(commit.branch)} · ${escapeHtml(commit.author)} · ${escapeHtml(commit.created_at)}</span>
            <p>${escapeHtml(commit.message)} · 元素 ${commit.element_count}</p>
          </div>
        `,
      )
      .join("")}
  `;
}

async function loadAudit() {
  const payload = await api(`/api/projects/${encodeURIComponent(state.project.id)}/audit?limit=80`);
  if (!payload.events.length) {
    els.auditList.innerHTML = `<div class="empty-state">暂无审计记录</div>`;
    return;
  }
  els.auditList.innerHTML = `
    <h3>审计日志</h3>
    ${payload.events
      .map(
        (event) => `
          <div class="audit-item">
            <strong>${escapeHtml(event.action)}</strong>
            <span>${escapeHtml(event.branch_name || "-")} · ${escapeHtml(event.actor)} · ${escapeHtml(event.created_at)}</span>
            <p>${escapeHtml(event.element_id || "")} ${escapeHtml(JSON.stringify(event.detail || {}))}</p>
          </div>
        `,
      )
      .join("")}
  `;
}

function renderBranchControls() {
  const branchOptions = state.branches
    .map((branch) => `<option value="${escapeAttr(branch.name)}">${escapeHtml(branch.name)}</option>`)
    .join("");
  els.mergeSourceSelect.innerHTML = branchOptions;
  const firstOther = state.branches.find((branch) => branch.name !== state.branch);
  if (firstOther) {
    els.mergeSourceSelect.value = firstOther.name;
  }
}

async function runDiff() {
  try {
    const params = new URLSearchParams({
      from: els.diffFromSelect.value,
      to: els.diffToSelect.value,
    });
    const diff = await api(
      `/api/projects/${encodeURIComponent(state.project.id)}/branches/${encodeURIComponent(state.branch)}/diff?${params}`,
    );
    renderDiff(diff);
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderDiff(diff) {
  els.diffSummary.textContent = `+${diff.summary.added} -${diff.summary.removed} ~${diff.summary.modified}`;
  els.diffResults.innerHTML = `
    <h3>差异 ${escapeHtml(diff.from)} → ${escapeHtml(diff.to)}</h3>
    ${renderDiffGroup("新增", diff.added)}
    ${renderDiffGroup("删除", diff.removed)}
    <section class="diff-group">
      <h4>修改</h4>
      ${
        diff.modified.length
          ? diff.modified
              .map(
                (item) => `
                  <div class="diff-item">
                    <strong>${escapeHtml(item.id)} ${escapeHtml(item.name)}</strong>
                    <p>${item.changes.map((change) => escapeHtml(change.field)).join(", ")}</p>
                  </div>
                `,
              )
              .join("")
          : `<p class="muted-line">无</p>`
      }
    </section>
  `;
}

function renderDiffGroup(title, items) {
  return `
    <section class="diff-group">
      <h4>${title}</h4>
      ${
        items.length
          ? items
              .map(
                (item) => `
                  <div class="diff-item">
                    <strong>${escapeHtml(item.id)}</strong>
                    <span>${escapeHtml(item.type)} · ${escapeHtml(item.name)}</span>
                  </div>
                `,
              )
              .join("")
          : `<p class="muted-line">无</p>`
      }
    </section>
  `;
}

async function rollbackToCommit() {
  const commit = els.rollbackCommitSelect.value;
  if (!commit) return;
  if (!window.confirm(`确认将当前分支回滚到 ${commit}？`)) return;
  try {
    const result = await api(
      `/api/projects/${encodeURIComponent(state.project.id)}/branches/${encodeURIComponent(state.branch)}/rollback`,
      { method: "POST", body: JSON.stringify({ commit }) },
    );
    await loadBranches();
    await loadElements();
    await loadVersionData();
    showToast(`已回滚并生成提交 ${result.commit.id}`);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function createBranch() {
  const name = els.newBranchInput.value.trim();
  if (!name) {
    showToast("请输入分支名", true);
    return;
  }
  try {
    await api(`/api/projects/${encodeURIComponent(state.project.id)}/branches`, {
      method: "POST",
      body: JSON.stringify({ name, source: state.branch }),
    });
    state.branch = name;
    els.newBranchInput.value = "";
    await loadBranches();
    await loadElements();
    await loadVersionData();
    showToast(`已创建分支 ${name}`);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function mergeBranch() {
  const source = els.mergeSourceSelect.value;
  if (!source || source === state.branch) {
    showToast("请选择不同的来源分支", true);
    return;
  }
  try {
    const result = await api(
      `/api/projects/${encodeURIComponent(state.project.id)}/branches/${encodeURIComponent(state.branch)}/merge`,
      {
        method: "POST",
        body: JSON.stringify({ source, force: els.forceMergeInput.checked }),
      },
    );
    if (!result.merged) {
      showToast(`存在 ${result.conflicts.length} 个冲突，未合并`, true);
      renderDiff({
        from: source,
        to: state.branch,
        summary: { added: result.additions.length, removed: 0, modified: result.conflicts.length },
        added: result.additions.map((id) => ({ id, type: "", name: "" })),
        removed: [],
        modified: result.conflicts.map((item) => ({ id: item.id, name: "", changes: [{ field: "conflict" }] })),
      });
      return;
    }
    await loadBranches();
    await loadElements();
    await loadVersionData();
    showToast(`已合并 ${source}`);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function generateDocument() {
  try {
    const result = await api(
      `/api/projects/${encodeURIComponent(state.project.id)}/branches/${encodeURIComponent(state.branch)}/documents`,
      {
        method: "POST",
        body: JSON.stringify({ template: els.templateInput.value, format: "html" }),
      },
    );
    state.currentDocument = result.document;
    els.documentFrame.srcdoc = result.document.html;
    els.documentStatus.textContent = result.document.id;
    await loadDocuments();
    showToast("文档已生成");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadDocuments() {
  if (!state.project) return;
  const payload = await api(
    `/api/projects/${encodeURIComponent(state.project.id)}/branches/${encodeURIComponent(state.branch)}/documents`,
  );
  if (!payload.documents.length) {
    els.documentList.innerHTML = `<div class="empty-state">暂无生成记录</div>`;
    return;
  }
  els.documentList.innerHTML = payload.documents
    .map(
      (document) => `
        <button class="document-item" data-id="${escapeAttr(document.id)}">
          <strong>${escapeHtml(document.id)}</strong>
          <span>${escapeHtml(document.created_at)} · ${escapeHtml(document.model_hash)}</span>
        </button>
      `,
    )
    .join("");
  els.documentList.querySelectorAll(".document-item").forEach((button) => {
    button.addEventListener("click", () => openDocument(button.dataset.id));
  });
}

async function openDocument(documentId) {
  try {
    const payload = await api(
      `/api/projects/${encodeURIComponent(state.project.id)}/branches/${encodeURIComponent(state.branch)}/documents/${encodeURIComponent(documentId)}`,
    );
    state.currentDocument = payload.document;
    els.documentFrame.srcdoc = payload.document.html;
    els.documentStatus.textContent = payload.document.id;
  } catch (error) {
    showToast(error.message, true);
  }
}

function downloadCurrent(format) {
  if (!state.currentDocument) {
    showToast("请先生成或打开文档", true);
    return;
  }
  if (format === "markdown") {
    downloadText(`${state.currentDocument.id}.md`, state.currentDocument.markdown, "text/markdown");
  } else if (format === "pdf") {
    if (!state.currentDocument.pdf_base64) {
      showToast("请重新生成文档以获取 PDF", true);
      return;
    }
    downloadBase64(
      `${state.currentDocument.id}.pdf`,
      state.currentDocument.pdf_base64,
      "application/pdf",
    );
  } else {
    downloadText(`${state.currentDocument.id}.html`, state.currentDocument.html, "text/html");
  }
}

function parseJsonField(value, label) {
  try {
    return value.trim() ? JSON.parse(value) : label.includes("关系") ? [] : {};
  } catch {
    throw new Error(`${label} 格式不正确`);
  }
}

function groupBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadBase64(filename, base64Text, type) {
  const binary = atob(base64Text || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.style.background = isError ? "#991b1b" : "#111827";
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function trimText(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function escapeSvg(value) {
  return escapeHtml(value);
}
