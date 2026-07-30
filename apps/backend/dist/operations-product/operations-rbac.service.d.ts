import { OperationsPermission, OperationsProductRole } from './operations-product.types';
export declare class OperationsRbacService {
    rolesFor(email: string): readonly OperationsProductRole[];
    assert(email: string, permission: OperationsPermission): readonly OperationsProductRole[];
}
