import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  getSignedBalancePayload(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, [{ walletCommitment: Uint8Array,
                                                                                         avgBalance: bigint,
                                                                                         issuedAt: bigint,
                                                                                         issuerKeyId: Uint8Array
                                                                                       },
                                                                                       Uint8Array]];
  getWalletSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getAdminSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  issueAttestation(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  verifyAttestation(context: __compactRuntime.CircuitContext<PS>,
                    commitment_0: Uint8Array,
                    minTier_0: bigint): Promise<__compactRuntime.CircuitResults<PS, boolean>>;
  registerIssuer(context: __compactRuntime.CircuitContext<PS>,
                 issuerKeyId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  revokeIssuer(context: __compactRuntime.CircuitContext<PS>,
               issuerKeyId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type ProvableCircuits<PS> = {
  issueAttestation(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  verifyAttestation(context: __compactRuntime.CircuitContext<PS>,
                    commitment_0: Uint8Array,
                    minTier_0: bigint): Promise<__compactRuntime.CircuitResults<PS, boolean>>;
  registerIssuer(context: __compactRuntime.CircuitContext<PS>,
                 issuerKeyId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  revokeIssuer(context: __compactRuntime.CircuitContext<PS>,
               issuerKeyId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  issueAttestation(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  verifyAttestation(context: __compactRuntime.CircuitContext<PS>,
                    commitment_0: Uint8Array,
                    minTier_0: bigint): Promise<__compactRuntime.CircuitResults<PS, boolean>>;
  registerIssuer(context: __compactRuntime.CircuitContext<PS>,
                 issuerKeyId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  revokeIssuer(context: __compactRuntime.CircuitContext<PS>,
               issuerKeyId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type Ledger = {
  readonly adminCommitment: Uint8Array;
  trustedIssuers: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<[Uint8Array, boolean]>
  };
  readonly bronzeMin: bigint;
  readonly silverMin: bigint;
  readonly goldMin: bigint;
  attestations: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { tier: bigint,
                                 issuer: Uint8Array,
                                 issuedAt: bigint
                               };
    [Symbol.iterator](): Iterator<[Uint8Array, { tier: bigint, issuer: Uint8Array, issuedAt: bigint }]>
  };
  readonly attestationCount: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               adminSecretCommitment_0: Uint8Array,
               initialIssuer_0: Uint8Array,
               _bronzeMin_0: bigint,
               _silverMin_0: bigint,
               _goldMin_0: bigint): Promise<__compactRuntime.ConstructorResult<PS>>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
export declare const expectedVk: Record<string, string>;
