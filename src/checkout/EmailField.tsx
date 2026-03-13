"use client"
/**
 * EmailField
 * ---------------------------------------------------------------------------
 * NOTE: Validation kept minimal (HTML required + browser email type). Extend with
 * custom patterns / accessibility messaging for production.
 */
import React from 'react'

interface EmailFieldProps {
  value: string
  onChange: (value: string) => void
}

export const EmailField: React.FC<EmailFieldProps> = ({ value, onChange }) => {
  return (
    <div className="">
      {/* STEP 0a: Email input component */}
      <label htmlFor="email-address" className="block text-sm/6 font-medium text-gray-700">
        Email address
      </label>
      <div className="mt-2">
        <input
          id="email-address"
          name="email-address"
          type="email"
          autoComplete="email"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full rounded-md bg-white px-3 py-2 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600 sm:text-sm/6"
        />
      </div>
    </div>
  )
}

export default EmailField
