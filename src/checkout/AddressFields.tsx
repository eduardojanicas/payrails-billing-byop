"use client"
/**
 * AddressFields
 * ---------------------------------------------------------------------------
 * Groups basic address inputs (street, city, region, postal). Layout mirrors the
 * original inline markup for easy drop-in replacement. Minimal validation only.
 */
import React from 'react'

interface AddressFieldsValue {
  address: string
  city: string
  region: string
  postal: string
}

interface AddressFieldsProps {
  value: AddressFieldsValue
  onChange: (patch: Partial<AddressFieldsValue>) => void
}

export const AddressFields: React.FC<AddressFieldsProps> = ({ value, onChange }) => {
  return (
    <div className="">
      <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label htmlFor="address" className="block text-sm/6 font-medium text-gray-700">
            Address
          </label>
          <div className="mt-2">
            <input
              id="address"
              name="address"
              type="text"
              autoComplete="street-address"
              required
              value={value.address}
              onChange={(e) => onChange({ address: e.target.value })}
              className="block w-full rounded-md bg-white px-3 py-2 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600 sm:text-sm/6"
            />
          </div>
        </div>
        <div>
          <label htmlFor="city" className="block text-sm/6 font-medium text-gray-700">
            City
          </label>
          <div className="mt-2">
            <input
              id="city"
              name="city"
              type="text"
              autoComplete="address-level2"
              required
              value={value.city}
              onChange={(e) => onChange({ city: e.target.value })}
              className="block w-full rounded-md bg-white px-3 py-2 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600 sm:text-sm/6"
            />
          </div>
        </div>
        <div>
          <label htmlFor="region" className="block text-sm/6 font-medium text-gray-700">
            State / Province
          </label>
          <div className="mt-2">
            <input
              id="region"
              name="region"
              type="text"
              autoComplete="address-level1"
              required
              value={value.region}
              onChange={(e) => onChange({ region: e.target.value })}
              className="block w-full rounded-md bg-white px-3 py-2 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600 sm:text-sm/6"
            />
          </div>
        </div>
        <div>
          <label htmlFor="postal-code" className="block text-sm/6 font-medium text-gray-700">
            Postal code
          </label>
          <div className="mt-2">
            <input
              id="postal-code"
              name="postal-code"
              type="text"
              autoComplete="postal-code"
              required
              value={value.postal}
              onChange={(e) => onChange({ postal: e.target.value })}
              className="block w-full rounded-md bg-white px-3 py-2 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600 sm:text-sm/6"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default AddressFields
