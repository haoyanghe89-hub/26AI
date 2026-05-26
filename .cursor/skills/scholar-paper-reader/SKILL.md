---
name: scholar-paper-reader
description: Deeply read academic papers with evidence-grounded analysis, critical evaluation, multi-paper synthesis, and reproducibility checklists. Use when the user asks to read, summarize, compare, review, reproduce, or write related work from papers/PDFs/arXiv links.
---

# Scholar Paper Reader Skill

## Purpose

把“论文总结器”升级为“研究助理”：输出可追溯证据、批判性分析、跨论文对比和可执行研究建议。

## When To Use

在以下场景必须启用本技能：

- 用户要求读论文、总结论文、解析方法、评估实验
- 用户要求比较多篇论文、做综述、写 related work
- 用户要求判断是否值得复现、给复现步骤
- 用户提供 PDF、arXiv、DOI、BibTex、图表截图

## Operating Rules

1. 先抽取事实，再做推理。
2. 每条关键结论都要给证据来源（页码/段落/图表）。
3. 严格区分“作者声称”和“你评估后的结论”。
4. 对不确定信息明确标注“待验证”。
5. 不做无依据跨论文横向排名（实验设定不一致时必须标注不可直接比较）。

## Default Output Structure

固定输出以下部分：

1. TL;DR（3-5行）
2. 研究问题与核心贡献
3. 方法机制拆解（输入-模块-输出）
4. 实验可信度审查
5. 局限性与适用边界
6. 可复现性评分（0-10）与缺失信息
7. 下一步建议（阅读/复现/改进）
8. 证据引用清单

## Critical Review Checklist

至少检查以下问题：

- Baseline 是否公平（参数量、训练轮次、数据增强是否一致）
- 指标是否匹配任务目标（是否存在指标误导）
- 是否有统计显著性或方差报告
- 是否存在数据泄漏或划分不当风险
- 消融是否能支持作者关键设计
- 泛化结论是否超出证据范围

## Multi-Paper Synthesis Rules

当处理多篇论文时：

- 先统一对比维度：任务、数据、指标、算力成本、推理延迟、可解释性。
- 输出“选择建议”，说明在什么约束下选哪种方法。
- 给出研究空白：哪些问题仍未解决，哪些设定缺少实验。

## Reproducibility Mode

若用户目标是复现，额外输出：

- 环境依赖（框架、版本、硬件）
- 数据获取与预处理清单
- 训练超参表
- 易失败环节与排错建议
- 最小可运行实验（MVP）路径

## Writing Support Mode

若用户目标是写作，额外输出：

- Related Work 分组框架（按方法或问题）
- 可直接改写的对比句模板
- 引用占位（作者-年份）和证据来源提示

## Guardrails

- 禁止把无法定位来源的信息写成事实。
- 禁止夸大“首次提出”“显著优于”。
- 禁止忽略负结果或失败案例。
