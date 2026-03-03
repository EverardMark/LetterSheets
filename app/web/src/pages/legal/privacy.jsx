import { useEffect } from "react";

export const privacyContent = (
    <>
        <h2>1. Introduction</h2>
        <p>Lettersheets ("we", "us", or "our") is committed to protecting the privacy and security of your personal information. This Privacy Policy explains how we collect, use, store, and disclose information when you use our human resources management platform ("Service").</p>
        <p>By using the Service, you consent to the data practices described in this policy. If you do not agree with this policy, please do not use the Service.</p>

        <h2>2. Information We Collect</h2>
        <p>We collect the following types of information:</p>
        <h3>2.1 Information You Provide</h3>
        <ul>
            <li><strong>Account Information:</strong> Name, email address, username, and password when you register for an account</li>
            <li><strong>Company Information:</strong> Company name, industry, country, city, state/province, and postal code</li>
            <li><strong>Employee Data:</strong> Information entered into the platform about employees, including names, positions, attendance records, and payroll details</li>
            <li><strong>Payment Information:</strong> Billing details and payment method information for paid subscriptions, processed through secure third-party payment processors</li>
        </ul>
        <h3>2.2 Information Collected Automatically</h3>
        <ul>
            <li><strong>Usage Data:</strong> Pages visited, features used, timestamps, and interaction patterns</li>
            <li><strong>Device Information:</strong> Browser type, operating system, device type, and screen resolution</li>
            <li><strong>Log Data:</strong> IP addresses, access times, referring URLs, and error logs</li>
            <li><strong>Cookies:</strong> Session cookies and authentication tokens necessary for the operation of the Service</li>
        </ul>

        <h2>3. How We Use Your Information</h2>
        <p>We use the information we collect to:</p>
        <ul>
            <li>Provide, operate, and maintain the Service</li>
            <li>Authenticate your identity and manage your account</li>
            <li>Process transactions and send related billing information</li>
            <li>Respond to your inquiries, comments, or support requests</li>
            <li>Monitor and analyze usage patterns to improve the Service</li>
            <li>Detect, prevent, and address security issues, fraud, or technical problems</li>
            <li>Send service-related notifications, updates, and administrative messages</li>
            <li>Comply with legal obligations and enforce our Terms of Service</li>
        </ul>
        <p>We do not sell, rent, or trade your personal information to third parties for marketing purposes.</p>

        <h2>4. End-to-End Encryption and Post-Quantum Cryptography</h2>
        <p>Lettersheets employs post-quantum cryptography (PQC) using NIST-standardized algorithms — including ML-KEM (Module-Lattice Key Encapsulation) for key exchange and ML-DSA (Module-Lattice Digital Signature) for authentication — to protect sensitive company and employee data against both current and future quantum computing threats.</p>
        <p>Sensitive database columns — such as employee personal information, payroll records, and confidential company data — are encrypted entirely on the client side before transmission. Our servers store only ciphertext for these fields and have no ability to read, decrypt, or access the plaintext contents. Encryption keys are derived from your password using industry-standard key derivation functions (PBKDF2-SHA256) on the client and are never transmitted to or stored on our servers.</p>
        <p>This zero-knowledge architecture means that only authenticated users with valid credentials or recovery keys can decrypt and view protected information. Even in the unlikely event of a server breach, encrypted column data remains unreadable. As a consequence of this security model, we cannot assist in recovering data if you lose both your password and recovery key file.</p>

        <h2>5. Data Storage and Security</h2>
        <p>We implement appropriate technical and organizational measures to protect your data, including:</p>
        <ul>
            <li>Post-quantum cryptography (ML-KEM, ML-DSA) for key exchange and digital signatures, resistant to both classical and quantum attacks</li>
            <li>Client-side column-level encryption for sensitive fields — our servers store only ciphertext and cannot read the underlying data</li>
            <li>TLS/SSL encryption for all data transmitted between your browser and our servers</li>
            <li>Secure password hashing using bcrypt with appropriate salt rounds</li>
            <li>Zero-knowledge architecture where decryption occurs exclusively on the client</li>
            <li>Regular security audits and vulnerability assessments</li>
            <li>Access controls limiting employee access to personal data on a need-to-know basis</li>
            <li>Secure cloud infrastructure with redundant backups</li>
        </ul>
        <p>While we strive to protect your information, no method of electronic transmission or storage is 100% secure.</p>

        <h2>6. Data Retention</h2>
        <p>We retain your personal information for as long as your account is active or as needed to provide the Service. Upon account termination, we will delete or anonymize your data within 90 days, except where retention is required by law.</p>
        <p>Encrypted data that cannot be decrypted without your keys will be permanently deleted in accordance with our retention schedule.</p>

        <h2>7. Sharing of Information</h2>
        <p>We may share your information in the following circumstances:</p>
        <ul>
            <li><strong>Service Providers:</strong> Third-party vendors who assist us in operating the Service, subject to confidentiality obligations</li>
            <li><strong>Legal Requirements:</strong> When required by law, regulation, legal process, or governmental request</li>
            <li><strong>Protection of Rights:</strong> To protect the rights, property, or safety of Lettersheets, our users, or the public</li>
            <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
            <li><strong>With Your Consent:</strong> When you explicitly authorize us to share your information</li>
        </ul>
        <p>We do not share your encrypted data with any third party, as we do not possess the ability to decrypt it.</p>

        <h2>8. Cookies and Tracking</h2>
        <p>We use strictly necessary cookies to operate the Service, including session authentication tokens and security cookies. We do not use advertising or third-party tracking cookies.</p>

        <h2>9. Your Rights</h2>
        <p>Depending on your jurisdiction, you may have the following rights:</p>
        <ul>
            <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
            <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data</li>
            <li><strong>Deletion:</strong> Request deletion of your personal data</li>
            <li><strong>Portability:</strong> Request a copy of your data in a structured, machine-readable format</li>
            <li><strong>Objection:</strong> Object to certain processing of your data</li>
            <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
        </ul>
        <p>To exercise any of these rights, please contact us at privacy@lettersheets.com.</p>

        <h2>10. Data Protection for Philippine Users</h2>
        <p>Lettersheets complies with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173). Philippine users have additional rights including the right to be informed, the right to object, the right to access, the right to rectification, the right to erasure or blocking, and the right to damages.</p>

        <h2>11. International Data Transfers</h2>
        <p>Your data may be processed and stored on servers located outside your country of residence. We ensure appropriate safeguards are in place, including encryption in transit and at rest and compliance with applicable data protection laws.</p>

        <h2>12. Children's Privacy</h2>
        <p>The Service is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children.</p>

        <h2>13. Third-Party Links</h2>
        <p>The Service may contain links to third-party websites or services not owned or controlled by Lettersheets. We are not responsible for their privacy practices.</p>

        <h2>14. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. We will notify you of material changes by posting the revised policy on the Service and updating the "Effective Date" above.</p>

        <h2>15. Contact Us</h2>
        <p>If you have questions or concerns regarding this Privacy Policy, please contact us at:</p>
        <p><strong>Lettersheets — Data Protection</strong><br/>Email: privacy@lettersheets.com<br/>General: legal@lettersheets.com<br/>Website: www.lettersheets.com</p>
    </>
);

export default function PrivacyPolicy() {

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <>
            <div className="pp-page">
                <div className="pp-container">
                    <div className="pp-header">
                        <div className="pp-logo">
                            <i className="fa-solid fa-table-columns" style={{fontSize:22, color:"#2d6a4f"}}></i>
                            <span className="pp-logo-text">LETTER<span className="pp-logo-bold">SHEETS</span></span>
                        </div>
                        <h1 className="pp-title">Privacy Policy</h1>
                        <p className="pp-effective">Effective Date: February 27, 2026</p>
                    </div>

                    <div className="pp-content">

                        <section className="pp-section">
                            <h2>1. Introduction</h2>
                            <p>
                                Lettersheets ("we", "us", or "our") is committed to protecting the privacy and security of your personal information. This Privacy Policy explains how we collect, use, store, and disclose information when you use our human resources management platform ("Service").
                            </p>
                            <p>
                                By using the Service, you consent to the data practices described in this policy. If you do not agree with this policy, please do not use the Service.
                            </p>
                        </section>

                        <section className="pp-section">
                            <h2>2. Information We Collect</h2>
                            <p>We collect the following types of information:</p>

                            <h3>2.1 Information You Provide</h3>
                            <ul>
                                <li><strong>Account Information:</strong> Name, email address, username, and password when you register for an account</li>
                                <li><strong>Company Information:</strong> Company name, industry, country, city, state/province, and postal code</li>
                                <li><strong>Employee Data:</strong> Information entered into the platform about employees, including names, positions, attendance records, and payroll details</li>
                                <li><strong>Payment Information:</strong> Billing details and payment method information for paid subscriptions, processed through secure third-party payment processors</li>
                            </ul>

                            <h3>2.2 Information Collected Automatically</h3>
                            <ul>
                                <li><strong>Usage Data:</strong> Pages visited, features used, timestamps, and interaction patterns</li>
                                <li><strong>Device Information:</strong> Browser type, operating system, device type, and screen resolution</li>
                                <li><strong>Log Data:</strong> IP addresses, access times, referring URLs, and error logs</li>
                                <li><strong>Cookies:</strong> Session cookies and authentication tokens necessary for the operation of the Service</li>
                            </ul>
                        </section>

                        <section className="pp-section">
                            <h2>3. How We Use Your Information</h2>
                            <p>We use the information we collect to:</p>
                            <ul>
                                <li>Provide, operate, and maintain the Service</li>
                                <li>Authenticate your identity and manage your account</li>
                                <li>Process transactions and send related billing information</li>
                                <li>Respond to your inquiries, comments, or support requests</li>
                                <li>Monitor and analyze usage patterns to improve the Service</li>
                                <li>Detect, prevent, and address security issues, fraud, or technical problems</li>
                                <li>Send service-related notifications, updates, and administrative messages</li>
                                <li>Comply with legal obligations and enforce our Terms of Service</li>
                            </ul>
                            <p>
                                We do not sell, rent, or trade your personal information to third parties for marketing purposes.
                            </p>
                        </section>

                        <section className="pp-section">
                            <h2>4. End-to-End Encryption and Post-Quantum Cryptography</h2>
                            <p>
                                Lettersheets employs post-quantum cryptography (PQC) using NIST-standardized algorithms — including ML-KEM (Module-Lattice Key Encapsulation) for key exchange and ML-DSA (Module-Lattice Digital Signature) for authentication — to protect sensitive company and employee data against both current and future quantum computing threats.
                            </p>
                            <p>
                                Sensitive database columns — such as employee personal information, payroll records, and confidential company data — are encrypted entirely on the client side before transmission. Our servers store only ciphertext for these fields and have no ability to read, decrypt, or access the plaintext contents. Encryption keys are derived from your password using industry-standard key derivation functions (PBKDF2-SHA256) on the client and are never transmitted to or stored on our servers.
                            </p>
                            <p>
                                This zero-knowledge architecture means that only authenticated users with valid credentials or recovery keys can decrypt and view protected information. Even in the unlikely event of a server breach, encrypted column data remains unreadable. As a consequence of this security model, we cannot assist in recovering data if you lose both your password and recovery key file.
                            </p>
                        </section>

                        <section className="pp-section">
                            <h2>5. Data Storage and Security</h2>
                            <p>
                                We implement appropriate technical and organizational measures to protect your data, including:
                            </p>
                            <ul>
                                <li>Post-quantum cryptography (ML-KEM, ML-DSA) for key exchange and digital signatures, resistant to both classical and quantum attacks</li>
                                <li>Client-side column-level encryption for sensitive fields — our servers store only ciphertext and cannot read the underlying data</li>
                                <li>TLS/SSL encryption for all data transmitted between your browser and our servers</li>
                                <li>Secure password hashing using bcrypt with appropriate salt rounds</li>
                                <li>Zero-knowledge architecture where decryption occurs exclusively on the client</li>
                                <li>Regular security audits and vulnerability assessments</li>
                                <li>Access controls limiting employee access to personal data on a need-to-know basis</li>
                                <li>Secure cloud infrastructure with redundant backups</li>
                            </ul>
                            <p>
                                While we strive to protect your information, no method of electronic transmission or storage is 100% secure. We cannot guarantee absolute security but are committed to following industry best practices.
                            </p>
                        </section>

                        <section className="pp-section">
                            <h2>6. Data Retention</h2>
                            <p>
                                We retain your personal information for as long as your account is active or as needed to provide the Service. Upon account termination, we will delete or anonymize your data within 90 days, except where retention is required by law, necessary to resolve disputes, or needed to enforce our agreements.
                            </p>
                            <p>
                                Encrypted data that cannot be decrypted without your keys will be permanently deleted in accordance with our retention schedule. Backup copies may persist for up to an additional 30 days before being purged from our systems.
                            </p>
                        </section>

                        <section className="pp-section">
                            <h2>7. Sharing of Information</h2>
                            <p>We may share your information in the following circumstances:</p>
                            <ul>
                                <li><strong>Service Providers:</strong> Third-party vendors who assist us in operating the Service, such as cloud hosting providers and payment processors, subject to confidentiality obligations</li>
                                <li><strong>Legal Requirements:</strong> When required by law, regulation, legal process, or governmental request</li>
                                <li><strong>Protection of Rights:</strong> To protect the rights, property, or safety of Lettersheets, our users, or the public</li>
                                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, reorganization, or sale of assets, in which case your data may be transferred to the successor entity</li>
                                <li><strong>With Your Consent:</strong> When you explicitly authorize us to share your information</li>
                            </ul>
                            <p>
                                We do not share your encrypted data with any third party, as we do not possess the ability to decrypt it.
                            </p>
                        </section>

                        <section className="pp-section">
                            <h2>8. Cookies and Tracking</h2>
                            <p>
                                We use strictly necessary cookies to operate the Service, including session authentication tokens and security cookies. We do not use advertising or third-party tracking cookies.
                            </p>
                            <p>
                                We may use privacy-respecting analytics tools to understand how the Service is used and to improve performance. These tools collect aggregated, non-personally identifiable data.
                            </p>
                        </section>

                        <section className="pp-section">
                            <h2>9. Your Rights</h2>
                            <p>Depending on your jurisdiction, you may have the following rights regarding your personal information:</p>
                            <ul>
                                <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
                                <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data</li>
                                <li><strong>Deletion:</strong> Request deletion of your personal data, subject to legal retention requirements</li>
                                <li><strong>Portability:</strong> Request a copy of your data in a structured, machine-readable format</li>
                                <li><strong>Objection:</strong> Object to certain processing of your data</li>
                                <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
                            </ul>
                            <p>
                                To exercise any of these rights, please contact us at privacy@lettersheets.com. We will respond to your request within 30 days.
                            </p>
                        </section>

                        <section className="pp-section">
                            <h2>10. Data Protection for Philippine Users</h2>
                            <p>
                                Lettersheets complies with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173) and its implementing rules and regulations. As a data controller, we are registered with the National Privacy Commission (NPC) and adhere to the principles of transparency, legitimate purpose, and proportionality in processing personal data.
                            </p>
                            <p>
                                Philippine users have additional rights under the Data Privacy Act, including the right to be informed, the right to object, the right to access, the right to rectification, the right to erasure or blocking, and the right to damages. For complaints or concerns, you may contact the NPC at complaints@privacy.gov.ph.
                            </p>
                        </section>

                        <section className="pp-section">
                            <h2>11. International Data Transfers</h2>
                            <p>
                                Your data may be processed and stored on servers located outside your country of residence. When we transfer data internationally, we ensure that appropriate safeguards are in place, including encryption in transit and at rest, contractual obligations with service providers, and compliance with applicable data protection laws.
                            </p>
                        </section>

                        <section className="pp-section">
                            <h2>12. Children's Privacy</h2>
                            <p>
                                The Service is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected data from a child without parental consent, we will take steps to delete that information promptly. If you believe a child has provided us with personal data, please contact us immediately.
                            </p>
                        </section>

                        <section className="pp-section">
                            <h2>13. Third-Party Links</h2>
                            <p>
                                The Service may contain links to third-party websites or services that are not owned or controlled by Lettersheets. We are not responsible for the privacy practices of these third parties. We encourage you to review the privacy policies of any third-party services you access through our platform.
                            </p>
                        </section>

                        <section className="pp-section">
                            <h2>14. Changes to This Policy</h2>
                            <p>
                                We may update this Privacy Policy from time to time to reflect changes in our practices, technology, or legal requirements. We will notify you of material changes by posting the revised policy on the Service and updating the "Effective Date" above. We encourage you to review this policy periodically.
                            </p>
                        </section>

                        <section className="pp-section">
                            <h2>15. Contact Us</h2>
                            <p>
                                If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us at:
                            </p>
                            <div className="pp-contact">
                                <p><strong>Lettersheets — Data Protection</strong></p>
                                <p>Email: privacy@lettersheets.com</p>
                                <p>General: legal@lettersheets.com</p>
                                <p>Website: www.lettersheets.com</p>
                            </div>
                        </section>

                    </div>

                    <div className="pp-footer">
                        <p>© {new Date().getFullYear()} Lettersheets. All rights reserved.</p>
                    </div>
                </div>
            </div>

            <style>{`
                .pp-page {
                    min-height: 100vh;
                    background: #f5f5f0;
                    display: flex;
                    justify-content: center;
                    padding: 40px 20px;
                    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif;
                }

                .pp-container {
                    width: 100%;
                    max-width: 760px;
                    background: #fff;
                    border-radius: 24px;
                    padding: 56px 52px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                }

                .pp-header {
                    text-align: center;
                    margin-bottom: 48px;
                    padding-bottom: 32px;
                    border-bottom: 1px solid #e8e8e5;
                }

                .pp-logo {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    margin-bottom: 28px;
                }

                .pp-logo-text {
                    font-size: 18px;
                    font-weight: 400;
                    letter-spacing: 3px;
                    color: #1a1a1a;
                }

                .pp-logo-bold {
                    font-weight: 700;
                }

                .pp-title {
                    font-size: 28px;
                    font-weight: 700;
                    color: #1a1a1a;
                    margin-bottom: 8px;
                }

                .pp-effective {
                    font-size: 14px;
                    color: #999;
                    font-weight: 500;
                }

                .pp-content {
                    color: #333;
                    line-height: 1.75;
                }

                .pp-section {
                    margin-bottom: 32px;
                }

                .pp-section h2 {
                    font-size: 17px;
                    font-weight: 700;
                    color: #1a1a1a;
                    margin-bottom: 12px;
                }

                .pp-section h3 {
                    font-size: 15px;
                    font-weight: 600;
                    color: #333;
                    margin-top: 16px;
                    margin-bottom: 8px;
                }

                .pp-section p {
                    font-size: 14.5px;
                    color: #444;
                    margin-bottom: 12px;
                    line-height: 1.8;
                }

                .pp-section ul {
                    padding-left: 24px;
                    margin-bottom: 12px;
                }

                .pp-section li {
                    font-size: 14.5px;
                    color: #444;
                    margin-bottom: 8px;
                    line-height: 1.7;
                }

                .pp-section li strong {
                    color: #333;
                }

                .pp-contact {
                    background: #f9f9f7;
                    border: 1px solid #e8e8e5;
                    border-radius: 12px;
                    padding: 16px 20px;
                    margin-top: 8px;
                }

                .pp-contact p {
                    margin-bottom: 4px;
                    font-size: 14px;
                }

                .pp-footer {
                    text-align: center;
                    margin-top: 48px;
                    padding-top: 24px;
                    border-top: 1px solid #e8e8e5;
                }

                .pp-footer p {
                    font-size: 12px;
                    color: #bbb;
                }

                @media (max-width: 600px) {
                    .pp-container {
                        padding: 32px 24px;
                        border-radius: 20px;
                    }
                    .pp-title {
                        font-size: 24px;
                    }
                }
            `}</style>
        </>
    );
}
