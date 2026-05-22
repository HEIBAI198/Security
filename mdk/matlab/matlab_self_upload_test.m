% MATLAB self-upload test for SysML DocGen.
% Upload this .m file in the MDK tab with the MATLAB adapter selected.
%
% sysml-docgen:begin
% {
%   "elements": [
%     {
%       "id": "REQ-SELF-MAT-101",
%       "name": "MATLAB 上传自测需求",
%       "type": "Requirement",
%       "stereotype": "requirement",
%       "description": "用于验证 MATLAB 脚本上传后会新增需求、模块和测试用例。",
%       "owner": "MDK 自测",
%       "attributes": {
%         "text": "系统应支持从 MATLAB .m 文件中的 sysml-docgen 标记导入新增模型元素。",
%         "verification": "Demo"
%       },
%       "relations": [
%         {
%           "type": "satisfy",
%           "target": "BLK-SELF-MAT-101"
%         },
%         {
%           "type": "verify",
%           "target": "TST-SELF-MAT-101"
%         }
%       ]
%     },
%     {
%       "id": "BLK-SELF-MAT-101",
%       "name": "MATLAB 上传自测模块",
%       "type": "Block",
%       "stereotype": "block",
%       "description": "用于满足 MATLAB 上传自测需求的示例模块。",
%       "owner": "MDK 自测",
%       "attributes": {
%         "domain": "external-tool-adapter"
%       },
%       "relations": []
%     },
%     {
%       "id": "TST-SELF-MAT-101",
%       "name": "MATLAB 上传自测用例",
%       "type": "TestCase",
%       "stereotype": "testCase",
%       "description": "上传该 MATLAB 文件后，在 Model 和 Graph 中检查新增元素及关系。",
%       "owner": "MDK 自测",
%       "attributes": {
%         "method": "MATLAB file upload",
%         "criterion": "Model shows 3 new elements and Graph shows satisfy/verify relations"
%       },
%       "relations": []
%     }
%   ]
% }
% sysml-docgen:end

soc_min = 32.5;
required_soc_min = 30.0;
assert(soc_min >= required_soc_min, "SOC margin is below the requirement");
disp("SysML DocGen MATLAB adapter self-upload test");
