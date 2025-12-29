import { describe, expect, it } from "vitest";

import { addressesEqual, addressInList, findByAddress } from "./address-utils";

describe("address-utils", () => {
  // Sample addresses in different case formats
  const checksumAddress = "0x912CE59144191C1204E64559FE8253a0e49E6548";
  const lowercaseAddress = "0x912ce59144191c1204e64559fe8253a0e49e6548";
  const mixedCaseAddress = "0x912CE59144191c1204E64559FE8253A0E49E6548";

  describe("addressesEqual", () => {
    it("returns true for identical addresses", () => {
      expect(addressesEqual(checksumAddress, checksumAddress)).toBe(true);
    });

    it("returns true for same address with different cases", () => {
      expect(addressesEqual(checksumAddress, lowercaseAddress)).toBe(true);
      expect(addressesEqual(checksumAddress, mixedCaseAddress)).toBe(true);
      expect(addressesEqual(lowercaseAddress, mixedCaseAddress)).toBe(true);
    });

    it("returns false for different addresses", () => {
      const otherAddress = "0x1234567890123456789012345678901234567890";
      expect(addressesEqual(checksumAddress, otherAddress)).toBe(false);
    });

    it("returns false when first address is null", () => {
      expect(addressesEqual(null, checksumAddress)).toBe(false);
    });

    it("returns false when second address is null", () => {
      expect(addressesEqual(checksumAddress, null)).toBe(false);
    });

    it("returns false when first address is undefined", () => {
      expect(addressesEqual(undefined, checksumAddress)).toBe(false);
    });

    it("returns false when second address is undefined", () => {
      expect(addressesEqual(checksumAddress, undefined)).toBe(false);
    });

    it("returns false when both addresses are null", () => {
      expect(addressesEqual(null, null)).toBe(false);
    });

    it("returns false when both addresses are undefined", () => {
      expect(addressesEqual(undefined, undefined)).toBe(false);
    });

    it("returns false for empty strings", () => {
      expect(addressesEqual("", checksumAddress)).toBe(false);
      expect(addressesEqual(checksumAddress, "")).toBe(false);
    });
  });

  describe("addressInList", () => {
    const addressList = [
      "0x912CE59144191C1204E64559FE8253a0e49E6548",
      "0x1234567890123456789012345678901234567890",
      "0xABCDEF1234567890123456789012345678901234",
    ] as const;

    it("returns true when address is in list (exact case)", () => {
      expect(addressInList(checksumAddress, addressList)).toBe(true);
    });

    it("returns true when address is in list (different case)", () => {
      expect(addressInList(lowercaseAddress, addressList)).toBe(true);
      expect(addressInList(mixedCaseAddress, addressList)).toBe(true);
    });

    it("returns false when address is not in list", () => {
      const notInList = "0x0000000000000000000000000000000000000001";
      expect(addressInList(notInList, addressList)).toBe(false);
    });

    it("returns false for null address", () => {
      expect(addressInList(null, addressList)).toBe(false);
    });

    it("returns false for undefined address", () => {
      expect(addressInList(undefined, addressList)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(addressInList("", addressList)).toBe(false);
    });

    it("returns false for empty list", () => {
      expect(addressInList(checksumAddress, [])).toBe(false);
    });
  });

  describe("findByAddress", () => {
    interface TestItem {
      address: string;
      name: string;
    }

    const items: TestItem[] = [
      {
        address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
        name: "Token A",
      },
      {
        address: "0x1234567890123456789012345678901234567890",
        name: "Token B",
      },
      {
        address: "0xABCDEF1234567890123456789012345678901234",
        name: "Token C",
      },
    ];

    it("finds item by exact address match", () => {
      const result = findByAddress(items, checksumAddress);
      expect(result).toBeDefined();
      expect(result?.name).toBe("Token A");
    });

    it("finds item by lowercase address", () => {
      const result = findByAddress(items, lowercaseAddress);
      expect(result).toBeDefined();
      expect(result?.name).toBe("Token A");
    });

    it("finds item by mixed case address", () => {
      const result = findByAddress(items, mixedCaseAddress);
      expect(result).toBeDefined();
      expect(result?.name).toBe("Token A");
    });

    it("returns undefined when address not found", () => {
      const notFound = "0x0000000000000000000000000000000000000001";
      expect(findByAddress(items, notFound)).toBeUndefined();
    });

    it("returns undefined for null address", () => {
      expect(findByAddress(items, null)).toBeUndefined();
    });

    it("returns undefined for undefined address", () => {
      expect(findByAddress(items, undefined)).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      expect(findByAddress(items, "")).toBeUndefined();
    });

    it("returns undefined for empty items array", () => {
      expect(findByAddress([], checksumAddress)).toBeUndefined();
    });
  });
});
