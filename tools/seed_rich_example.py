"""Seed a rich SysML example project into the local repository."""

from __future__ import annotations

import copy
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sysml_docgen.docgen import stable_hash, utc_now
from sysml_docgen.repository import ModelStore


PROJECT_ID = "campus-microgrid-example"
NOW = "2026-05-29T00:00:00+08:00"


def element(
    element_id: str,
    name: str,
    element_type: str,
    stereotype: str,
    description: str,
    owner: str,
    attributes: dict[str, Any],
    relations: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    return {
        "id": element_id,
        "name": name,
        "type": element_type,
        "stereotype": stereotype,
        "description": description,
        "owner": owner,
        "attributes": attributes,
        "relations": relations or [],
        "created_at": NOW,
        "updated_at": NOW,
    }


def build_elements() -> dict[str, dict[str, Any]]:
    items = [
        element(
            "REQ-MG-001",
            "关键负载不断电需求",
            "Requirement",
            "requirement",
            "图书馆、数据中心和安防系统在市电中断时仍需保持供电。",
            "总体组",
            {
                "text": "市电中断后 2 秒内，微电网应完成孤岛切换，并保证关键负载母线电压维持在 380V±5%。",
                "priority": "High",
                "verification": "Test",
                "rationale": "保障校园核心业务连续运行。",
            },
            [
                {"type": "satisfy", "target": "BLK-EMS"},
                {"type": "satisfy", "target": "BLK-BESS"},
                {"type": "verify", "target": "TST-MG-001"},
                {"type": "constrain", "target": "CST-SWITCH-001"},
            ],
        ),
        element(
            "REQ-MG-002",
            "可再生能源优先消纳需求",
            "Requirement",
            "requirement",
            "系统应优先利用光伏与储能，降低购电成本。",
            "能源管理组",
            {
                "text": "在满足安全约束前提下，光伏发电应优先供本地负载使用，日弃光率不高于 5%。",
                "priority": "High",
                "verification": "Analysis",
            },
            [
                {"type": "satisfy", "target": "BLK-PV"},
                {"type": "satisfy", "target": "ACT-OPT-001"},
                {"type": "verify", "target": "TST-MG-002"},
                {"type": "constrain", "target": "CST-PV-001"},
            ],
        ),
        element(
            "REQ-MG-003",
            "电池寿命保护需求",
            "Requirement",
            "requirement",
            "储能系统运行策略应避免过充、过放和高频深循环。",
            "储能组",
            {
                "text": "BESS 荷电状态应保持在 20% 至 90% 之间，单日等效满充满放循环不超过 1.2 次。",
                "priority": "Medium",
                "verification": "Analysis",
            },
            [
                {"type": "satisfy", "target": "BLK-BESS"},
                {"type": "verify", "target": "TST-MG-003"},
                {"type": "constrain", "target": "CST-SOC-001"},
            ],
        ),
        element(
            "REQ-MG-004",
            "故障隔离需求",
            "Requirement",
            "requirement",
            "单个馈线故障不应扩散到全校园供电网络。",
            "保护组",
            {
                "text": "任一非关键馈线短路后，保护装置应在 150ms 内完成隔离，并生成告警事件。",
                "priority": "High",
                "verification": "Test",
            },
            [
                {"type": "satisfy", "target": "BLK-SWITCHGEAR"},
                {"type": "satisfy", "target": "ACT-FAULT-001"},
                {"type": "verify", "target": "TST-MG-004"},
            ],
        ),
        element(
            "REQ-MG-005",
            "运行态势可视化需求",
            "Requirement",
            "requirement",
            "调度员应能看到能源流、告警、预测和关键 KPI。",
            "运维组",
            {
                "text": "控制台应每 5 秒刷新一次功率、SOC、告警和碳排指标，并支持按建筑筛选。",
                "priority": "Medium",
                "verification": "Inspection",
            },
            [
                {"type": "satisfy", "target": "BLK-HMI"},
                {"type": "satisfy", "target": "IF-MONITOR-001"},
                {"type": "verify", "target": "TST-MG-005"},
            ],
        ),
        element(
            "REQ-MG-006",
            "外部系统互操作需求",
            "Requirement",
            "requirement",
            "微电网应与楼宇自控、气象服务和电网调度系统交换数据。",
            "接口组",
            {
                "text": "系统应通过标准接口接收气象预测、负载预测和电价信号，并向楼宇自控下发削峰建议。",
                "priority": "Medium",
                "verification": "Interface Test",
            },
            [
                {"type": "satisfy", "target": "IF-GRID-001"},
                {"type": "satisfy", "target": "IF-BAS-001"},
                {"type": "verify", "target": "TST-MG-006"},
            ],
        ),
        element(
            "BLK-MICROGRID",
            "校园微电网系统",
            "Block",
            "block",
            "微电网系统边界，包含能源管理、储能、光伏、配电和人机界面。",
            "总体组",
            {"criticality": "System", "voltage": "380V AC / 750V DC"},
            [
                {"type": "compose", "target": "BLK-EMS"},
                {"type": "compose", "target": "BLK-BESS"},
                {"type": "compose", "target": "BLK-PV"},
                {"type": "compose", "target": "BLK-SWITCHGEAR"},
                {"type": "compose", "target": "BLK-HMI"},
            ],
        ),
        element(
            "BLK-EMS",
            "能源管理控制器",
            "Block",
            "block",
            "执行预测、优化调度、孤岛切换和告警策略。",
            "控制组",
            {"software": "EMS Core", "redundancy": "hot-standby"},
            [
                {"type": "satisfy", "target": "REQ-MG-001"},
                {"type": "satisfy", "target": "REQ-MG-002"},
                {"type": "allocate", "target": "ACT-OPT-001"},
                {"type": "allocate", "target": "ACT-ISLAND-001"},
                {"type": "connect", "target": "IF-GRID-001"},
            ],
        ),
        element(
            "BLK-BESS",
            "储能电池系统",
            "Block",
            "block",
            "提供削峰填谷、应急供电和频率支撑能力。",
            "储能组",
            {"capacity": "2 MWh", "power": "1 MW", "chemistry": "LFP"},
            [
                {"type": "satisfy", "target": "REQ-MG-001"},
                {"type": "satisfy", "target": "REQ-MG-003"},
                {"type": "expose", "target": "PRT-DC-001"},
                {"type": "constrain", "target": "CST-SOC-001"},
            ],
        ),
        element(
            "BLK-PV",
            "屋顶光伏阵列",
            "Block",
            "block",
            "由多栋教学楼屋顶逆变器组成的分布式光伏资源。",
            "新能源组",
            {"capacity": "1.6 MWp", "inverter_count": 12},
            [
                {"type": "satisfy", "target": "REQ-MG-002"},
                {"type": "expose", "target": "PRT-DC-002"},
                {"type": "constrain", "target": "CST-PV-001"},
            ],
        ),
        element(
            "BLK-SWITCHGEAR",
            "智能配电柜",
            "Block",
            "block",
            "采集馈线状态并执行保护、隔离和并网切换命令。",
            "保护组",
            {"feeders": 8, "protection": "overcurrent/earth-fault"},
            [
                {"type": "satisfy", "target": "REQ-MG-004"},
                {"type": "allocate", "target": "ACT-FAULT-001"},
                {"type": "expose", "target": "PRT-AC-001"},
            ],
        ),
        element(
            "BLK-HMI",
            "调度监控台",
            "Block",
            "block",
            "为运维人员提供能源态势、告警处置和报表导出能力。",
            "运维组",
            {"clients": "web", "refresh": "5s"},
            [
                {"type": "satisfy", "target": "REQ-MG-005"},
                {"type": "connect", "target": "IF-MONITOR-001"},
            ],
        ),
        element(
            "BLK-WEATHER",
            "气象预测服务",
            "Block",
            "block",
            "提供辐照度、温度和降雨预测，用于光伏出力预测。",
            "外部系统",
            {"provider": "campus weather API"},
            [{"type": "connect", "target": "IF-WEATHER-001"}],
        ),
        element(
            "IF-GRID-001",
            "电网调度接口",
            "Interface",
            "interfaceBlock",
            "与上级电网交换并网状态、负荷指令和电价信号。",
            "接口组",
            {"protocol": "IEC 61850 / REST bridge", "latency": "< 1s"},
            [{"type": "satisfy", "target": "REQ-MG-006"}],
        ),
        element(
            "IF-BAS-001",
            "楼宇自控接口",
            "Interface",
            "interfaceBlock",
            "向楼宇自控系统发送削峰建议并接收 HVAC 负载状态。",
            "接口组",
            {"protocol": "BACnet/IP", "payload": "load-shed advisory"},
            [{"type": "satisfy", "target": "REQ-MG-006"}],
        ),
        element(
            "IF-MONITOR-001",
            "监控数据接口",
            "Interface",
            "interfaceBlock",
            "提供功率、SOC、告警和 KPI 数据订阅。",
            "运维组",
            {"protocol": "WebSocket + REST", "refresh": "5s"},
            [{"type": "satisfy", "target": "REQ-MG-005"}],
        ),
        element(
            "IF-WEATHER-001",
            "气象预测接口",
            "Interface",
            "interfaceBlock",
            "接入短时辐照度与云量预测。",
            "接口组",
            {"protocol": "HTTPS JSON", "period": "15min"},
            [{"type": "connect", "target": "BLK-WEATHER"}],
        ),
        element(
            "PRT-AC-001",
            "交流母线端口",
            "Port",
            "proxyPort",
            "微电网交流母线与配电柜之间的功率接口。",
            "电气组",
            {"direction": "inout", "interface": "IF-GRID-001", "rated_voltage": "380V"},
            [{"type": "connect", "target": "IF-GRID-001"}],
        ),
        element(
            "PRT-DC-001",
            "储能直流端口",
            "Port",
            "proxyPort",
            "BESS 与 PCS 之间的直流功率接口。",
            "储能组",
            {"direction": "inout", "interface": "IF-MONITOR-001", "rated_voltage": "750V"},
            [{"type": "connect", "target": "BLK-BESS"}],
        ),
        element(
            "PRT-DC-002",
            "光伏直流端口",
            "Port",
            "proxyPort",
            "PV 阵列接入逆变器的直流功率端口。",
            "新能源组",
            {"direction": "out", "interface": "IF-MONITOR-001", "rated_voltage": "1000V"},
            [{"type": "connect", "target": "BLK-PV"}],
        ),
        element(
            "ACT-OPT-001",
            "日前优化调度",
            "Activity",
            "activity",
            "基于负载、天气和电价预测生成 24 小时调度计划。",
            "控制组",
            {"trigger": "每天 00:05 或预测更新", "result": "24h dispatch plan"},
            [
                {"type": "satisfy", "target": "REQ-MG-002"},
                {"type": "allocate", "target": "BLK-EMS"},
                {"type": "flow", "target": "ACT-DISPATCH-001"},
            ],
        ),
        element(
            "ACT-DISPATCH-001",
            "实时功率分配",
            "Activity",
            "activity",
            "根据实时测量修正功率分配并下发 setpoint。",
            "控制组",
            {"trigger": "5s control cycle", "result": "active/reactive power setpoints"},
            [
                {"type": "allocate", "target": "BLK-EMS"},
                {"type": "flow", "target": "ACT-FAULT-001"},
            ],
        ),
        element(
            "ACT-ISLAND-001",
            "孤岛切换",
            "Activity",
            "activity",
            "检测市电异常后转入孤岛运行并维持关键负载。",
            "保护组",
            {"trigger": "grid outage", "result": "island mode enabled within 2s"},
            [
                {"type": "satisfy", "target": "REQ-MG-001"},
                {"type": "allocate", "target": "BLK-EMS"},
            ],
        ),
        element(
            "ACT-FAULT-001",
            "故障检测与隔离",
            "Activity",
            "activity",
            "识别馈线故障，隔离故障段并生成告警。",
            "保护组",
            {"trigger": "fault relay trip", "result": "faulted feeder isolated"},
            [
                {"type": "satisfy", "target": "REQ-MG-004"},
                {"type": "allocate", "target": "BLK-SWITCHGEAR"},
            ],
        ),
        element(
            "ST-GRID-001",
            "并网运行",
            "State",
            "state",
            "微电网与市电并联运行，按经济性目标调度。",
            "控制组",
            {"mode": "grid-connected"},
            [{"type": "transition", "target": "ST-ISLAND-001"}],
        ),
        element(
            "ST-ISLAND-001",
            "孤岛运行",
            "State",
            "state",
            "市电不可用时由储能和光伏维持关键负载。",
            "控制组",
            {"mode": "islanded"},
            [{"type": "transition", "target": "ST-RECOVERY-001"}],
        ),
        element(
            "ST-RECOVERY-001",
            "并网恢复",
            "State",
            "state",
            "市电恢复后进行同步检查并重新并网。",
            "控制组",
            {"mode": "resync"},
            [{"type": "transition", "target": "ST-GRID-001"}],
        ),
        element(
            "CST-SWITCH-001",
            "孤岛切换时间约束",
            "Constraint",
            "constraintBlock",
            "孤岛切换必须满足关键负载供电连续性。",
            "保护组",
            {"expression": "t_island_switch <= 2s"},
            [
                {"type": "constrain", "target": "REQ-MG-001"},
                {"type": "constrain", "target": "BLK-EMS"},
            ],
        ),
        element(
            "CST-SOC-001",
            "电池 SOC 运行约束",
            "Constraint",
            "constraintBlock",
            "限制储能 SOC 工作区间和循环次数。",
            "储能组",
            {"expression": "20% <= SOC <= 90% and EFC_day <= 1.2"},
            [
                {"type": "constrain", "target": "REQ-MG-003"},
                {"type": "constrain", "target": "BLK-BESS"},
            ],
        ),
        element(
            "CST-PV-001",
            "弃光率约束",
            "Constraint",
            "constraintBlock",
            "衡量光伏消纳策略的关键约束。",
            "新能源组",
            {"expression": "curtailment_energy / pv_available_energy <= 0.05"},
            [{"type": "constrain", "target": "REQ-MG-002"}],
        ),
        element(
            "TST-MG-001",
            "孤岛切换测试",
            "TestCase",
            "testCase",
            "模拟市电中断，验证关键负载不断电。",
            "测试组",
            {"method": "Hardware-in-the-loop", "criterion": "switching time <= 2s and voltage within ±5%"},
            [{"type": "verify", "target": "REQ-MG-001"}],
        ),
        element(
            "TST-MG-002",
            "光伏消纳分析",
            "TestCase",
            "testCase",
            "使用 30 天天气与负载曲线评估弃光率。",
            "测试组",
            {"method": "Simulation", "criterion": "curtailment <= 5%"},
            [{"type": "verify", "target": "REQ-MG-002"}],
        ),
        element(
            "TST-MG-003",
            "储能寿命策略分析",
            "TestCase",
            "testCase",
            "评估 SOC 约束和循环次数对寿命的影响。",
            "测试组",
            {"method": "Analysis", "criterion": "SOC within limit and EFC_day <= 1.2"},
            [{"type": "verify", "target": "REQ-MG-003"}],
        ),
        element(
            "TST-MG-004",
            "馈线故障隔离测试",
            "TestCase",
            "testCase",
            "注入馈线短路故障，验证保护隔离时间和告警。",
            "测试组",
            {"method": "Protection relay test", "criterion": "fault isolation <= 150ms"},
            [{"type": "verify", "target": "REQ-MG-004"}],
        ),
        element(
            "TST-MG-005",
            "监控刷新验收",
            "TestCase",
            "testCase",
            "验证调度监控台刷新周期和数据完整性。",
            "测试组",
            {"method": "Inspection", "criterion": "dashboard refresh <= 5s"},
            [{"type": "verify", "target": "REQ-MG-005"}],
        ),
        element(
            "TST-MG-006",
            "外部接口联调",
            "TestCase",
            "testCase",
            "验证气象、电网调度和楼宇自控接口互操作。",
            "测试组",
            {"method": "Interface Test", "criterion": "all API contract tests pass"},
            [{"type": "verify", "target": "REQ-MG-006"}],
        ),
        element(
            "VP-MG-REQ",
            "需求评审视角",
            "Viewpoint",
            "viewpoint",
            "用于需求审查，关注需求、满足关系、测试用例和约束。",
            "系统工程组",
            {
                "purpose": "检查需求覆盖、验证链路和关键约束。",
                "allowed_types": ["Requirement", "Block", "Activity", "TestCase", "Constraint"],
                "required_types": ["Requirement", "TestCase"],
                "allowed_relations": ["satisfy", "verify", "constrain", "refine"],
                "default_query": {
                    "types": ["Requirement", "Block", "Activity", "TestCase", "Constraint"],
                    "relations": ["satisfy", "verify", "constrain"],
                    "depth": 1,
                },
                "document_template": "# {{view.name}}\n\n## 范围\n{{view.scope}}\n\n## 追踪\n{{view.traceability}}\n\n## 校验\n{{view.validation}}\n",
            },
            [{"type": "refine", "target": "VIEW-MG-REQ"}],
        ),
        element(
            "VIEW-MG-REQ",
            "微电网需求追踪视图",
            "View",
            "view",
            "从需求出发查看满足、验证和约束关系。",
            "系统工程组",
            {
                "viewpoint_id": "VP-MG-REQ",
                "manual_element_ids": ["REQ-MG-001", "REQ-MG-002", "REQ-MG-003", "REQ-MG-004", "REQ-MG-005", "REQ-MG-006"],
                "query": {"types": ["Requirement", "Block", "Activity", "TestCase", "Constraint"], "relations": ["satisfy", "verify", "constrain"], "depth": 1},
                "summary": "需求到设计与测试的覆盖视图。",
            },
            [
                {"type": "conform", "target": "VP-MG-REQ"},
                {"type": "include", "target": "REQ-MG-001"},
                {"type": "include", "target": "REQ-MG-002"},
                {"type": "include", "target": "REQ-MG-003"},
            ],
        ),
        element(
            "VIEW-MG-STRUCT",
            "微电网结构与接口视图",
            "View",
            "view",
            "展示主要 Block、端口和外部接口。",
            "架构组",
            {
                "manual_element_ids": ["BLK-MICROGRID", "BLK-EMS", "BLK-BESS", "BLK-PV", "BLK-SWITCHGEAR", "BLK-HMI"],
                "query": {"types": ["Block", "Interface", "Port", "Constraint"], "relations": ["compose", "connect", "expose", "constrain"], "depth": 1},
                "summary": "结构、接口和端口关系视图。",
            },
            [
                {"type": "include", "target": "BLK-MICROGRID"},
                {"type": "include", "target": "IF-GRID-001"},
                {"type": "include", "target": "PRT-AC-001"},
            ],
        ),
    ]
    return {item["id"]: item for item in items}


def build_project() -> dict[str, Any]:
    elements = build_elements()
    snapshot = copy.deepcopy(elements)
    commit_id = f"C-0001-{stable_hash(snapshot)[:6]}"
    return {
        "id": PROJECT_ID,
        "name": "校园微电网能源管理系统完整示例",
        "description": "一个元素较完整的 SysML 示例，覆盖需求、结构、接口、端口、活动、状态、约束、测试、View 和 Viewpoint。",
        "organization": "系统工程课程设计示例",
        "created_at": NOW,
        "updated_at": utc_now(),
        "visibility": "shared",
        "kind": "shared",
        "owner": "teacher",
        "members": [
            {"username": "teacher", "role": "owner"},
            {"username": "teacher1", "role": "editor"},
            {"username": "engineer", "role": "editor"},
            {"username": "reviewer", "role": "viewer"},
        ],
        "source_project_id": "",
        "published_from": "",
        "published_by": "",
        "published_at": "",
        "copied_from": "",
        "copied_by": "",
        "copied_at": "",
        "roles": {},
        "branches": {
            "main": {
                "name": "main",
                "head": commit_id,
                "elements": elements,
                "documents": [],
                "created_at": NOW,
            }
        },
        "commits": [
            {
                "id": commit_id,
                "branch": "main",
                "message": "初始化校园微电网完整示例",
                "author": "teacher",
                "created_at": NOW,
                "model_hash": stable_hash(snapshot),
                "element_count": len(snapshot),
                "snapshot": snapshot,
            }
        ],
        "tags": [],
    }


def main() -> None:
    store = ModelStore()
    project = build_project()
    store.data.setdefault("projects", {})[PROJECT_ID] = project
    store.save()
    store.record_audit(
        PROJECT_ID,
        "main",
        "seed_rich_example",
        "teacher",
        detail={"elements": len(project["branches"]["main"]["elements"])},
    )
    print(f"Seeded {PROJECT_ID} with {len(project['branches']['main']['elements'])} elements")


if __name__ == "__main__":
    main()
