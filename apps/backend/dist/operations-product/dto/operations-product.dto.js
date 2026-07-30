"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RollbackRequest = exports.CreateIncidentRequest = exports.CreateOperationsChangeRequest = void 0;
const class_validator_1 = require("class-validator");
class CreateOperationsChangeRequest {
    area;
    action;
    reason;
}
exports.CreateOperationsChangeRequest = CreateOperationsChangeRequest;
__decorate([
    (0, class_validator_1.IsIn)(['google-cloud', 'firebase', 'ci-cd', 'production', 'monitoring', 'security']),
    __metadata("design:type", String)
], CreateOperationsChangeRequest.prototype, "area", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(3, 120),
    __metadata("design:type", String)
], CreateOperationsChangeRequest.prototype, "action", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(10, 500),
    __metadata("design:type", String)
], CreateOperationsChangeRequest.prototype, "reason", void 0);
class CreateIncidentRequest {
    title;
    severity;
    summary;
}
exports.CreateIncidentRequest = CreateIncidentRequest;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(3, 120),
    __metadata("design:type", String)
], CreateIncidentRequest.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['low', 'medium', 'high', 'critical']),
    __metadata("design:type", String)
], CreateIncidentRequest.prototype, "severity", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(10, 500),
    __metadata("design:type", String)
], CreateIncidentRequest.prototype, "summary", void 0);
class RollbackRequest {
    deploymentId;
    reason;
}
exports.RollbackRequest = RollbackRequest;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(3, 120),
    __metadata("design:type", String)
], RollbackRequest.prototype, "deploymentId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(10, 500),
    __metadata("design:type", String)
], RollbackRequest.prototype, "reason", void 0);
//# sourceMappingURL=operations-product.dto.js.map