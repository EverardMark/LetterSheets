import { useEffect } from "react";

export const termsContent = (
    <>
        <h2>1. Acceptance of Terms</h2>
        <p>By accessing or using the Lettersheets platform ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not access or use the Service. These Terms apply to all users, including administrators, employees, and any other individuals who access the Service.</p>

        <h2>2. Description of Service</h2>
        <p>Lettersheets is a cloud-based human resources management platform that provides tools for employee management, attendance tracking, payroll processing, position management, and other HR-related functions. The Service is provided on a subscription basis and may include free and paid tiers.</p>

        <h2>3. Account Registration</h2>
        <p>To use the Service, you must create an account by providing accurate, current, and complete information. You are responsible for maintaining the confidentiality of your account credentials, including your password and recovery keys. You agree to notify us immediately of any unauthorized use of your account.</p>
        <p>Each account is associated with a company entity. The individual who creates the company account is designated as the administrator and assumes responsibility for managing users, permissions, and company data within the platform.</p>

        <h2>4. Data Ownership and Privacy</h2>
        <p>You retain all ownership rights to the data you submit to the Service ("Your Data"). Lettersheets does not claim ownership of Your Data. We process Your Data solely to provide and improve the Service, in accordance with our Privacy Policy.</p>
        <p>Lettersheets employs post-quantum cryptography (PQC) and client-side encryption to protect sensitive company data. Certain database columns containing sensitive information — such as employee personal details, payroll data, and confidential records — are encrypted entirely on the client side before being transmitted to our servers. This means that Lettersheets servers store only ciphertext for these fields and have no ability to read, decrypt, or access the plaintext contents. Only authenticated users with valid credentials or recovery keys can decrypt and view protected data.</p>

        <h2>5. Encryption and Recovery Keys</h2>
        <p>Upon account creation, the Service generates post-quantum cryptographic keys using NIST-standardized algorithms, including ML-KEM (Module-Lattice Key Encapsulation) for key exchange and ML-DSA (Module-Lattice Digital Signature) for authentication. These algorithms are designed to resist attacks from both classical and quantum computers. Encryption keys are derived from your password on the client side and are never transmitted to or stored on our servers in plaintext.</p>
        <p>A recovery key file is provided at registration, and it is your sole responsibility to store this file securely. Lettersheets cannot reset your password or decrypt your data without this recovery key. Because encrypted columns are decrypted exclusively on the client, our servers have zero knowledge of the underlying data.</p>
        <p>By using the Service, you acknowledge and accept that the loss of both your password and recovery key will result in permanent and irreversible loss of access to your encrypted data. Lettersheets shall not be liable for any data loss resulting from lost credentials or recovery keys.</p>

        <h2>6. Acceptable Use</h2>
        <p>You agree not to use the Service to:</p>
        <ul>
            <li>Violate any applicable law, regulation, or third-party rights</li>
            <li>Upload or transmit malicious code, viruses, or harmful data</li>
            <li>Attempt to gain unauthorized access to other accounts, systems, or networks</li>
            <li>Interfere with or disrupt the integrity or performance of the Service</li>
            <li>Use the Service for any fraudulent, deceptive, or misleading purpose</li>
            <li>Reverse-engineer, decompile, or attempt to extract the source code of the Service</li>
            <li>Store or process data that violates applicable data protection laws</li>
        </ul>

        <h2>7. Subscription and Payment</h2>
        <p>Certain features of the Service may require a paid subscription. Subscription fees are billed in advance on a monthly or annual basis, depending on the plan you select. All fees are non-refundable except as required by law or as explicitly stated in these Terms.</p>
        <p>We reserve the right to modify pricing with at least 30 days' notice. Continued use of the Service after a price change constitutes acceptance of the new pricing.</p>

        <h2>8. Service Availability and Modifications</h2>
        <p>We strive to maintain the availability of the Service but do not guarantee uninterrupted or error-free operation. We may modify, suspend, or discontinue any part of the Service at any time, with or without notice. We will make reasonable efforts to notify users of significant changes.</p>

        <h2>9. Intellectual Property</h2>
        <p>The Service, including its design, code, features, documentation, and branding, is the intellectual property of Lettersheets and is protected by copyright, trademark, and other intellectual property laws. You are granted a limited, non-exclusive, non-transferable license to use the Service for its intended purpose during the term of your subscription.</p>

        <h2>10. Limitation of Liability</h2>
        <p>To the maximum extent permitted by applicable law, Lettersheets and its affiliates, officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, business opportunities, or goodwill, arising from your use of or inability to use the Service.</p>
        <p>Our total aggregate liability for any claims arising from or relating to these Terms or the Service shall not exceed the amount you paid to Lettersheets in the twelve (12) months preceding the event giving rise to the claim.</p>

        <h2>11. Indemnification</h2>
        <p>You agree to indemnify, defend, and hold harmless Lettersheets and its affiliates from and against any claims, liabilities, damages, losses, and expenses, including reasonable legal fees, arising out of or in any way connected with your access to or use of the Service, your violation of these Terms, or your infringement of any third-party rights.</p>

        <h2>12. Termination</h2>
        <p>You may terminate your account at any time by contacting us or through your account settings. We may suspend or terminate your account if you violate these Terms, fail to pay applicable fees, or if we are required to do so by law.</p>
        <p>Upon termination, your right to access the Service will immediately cease. We may retain certain data as required by law or for legitimate business purposes. Encrypted data that cannot be decrypted without your keys will be deleted in accordance with our data retention policy.</p>

        <h2>13. Governing Law</h2>
        <p>These Terms shall be governed by and construed in accordance with the laws of the Republic of the Philippines, without regard to its conflict of law provisions. Any disputes arising from or relating to these Terms shall be resolved in the courts of Makati City, Philippines.</p>

        <h2>14. Changes to These Terms</h2>
        <p>We reserve the right to update or modify these Terms at any time. We will notify you of material changes by posting the revised Terms on the Service and updating the "Effective Date" above. Your continued use of the Service following any changes constitutes acceptance of the updated Terms.</p>

        <h2>15. Contact Us</h2>
        <p>If you have questions or concerns about these Terms of Service, please contact us at:</p>
        <p><strong>Lettersheets</strong><br/>Email: legal@lettersheets.com<br/>Website: www.lettersheets.com</p>
    </>
);

export default function TermsOfService() {

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <>
            <div className="tos-page">
                <div className="tos-container">
                    <div className="tos-header">
                        <div className="tos-logo">
                            <i className="fa-solid fa-table-columns" style={{fontSize:22, color:"#2d6a4f"}}></i>
                            <span className="tos-logo-text">LETTER<span className="tos-logo-bold">SHEETS</span></span>
                        </div>
                        <h1 className="tos-title">Terms of Service</h1>
                        <p className="tos-effective">Effective Date: February 27, 2026</p>
                    </div>

                    <div className="tos-content">

                        <section className="tos-section">
                            <h2>1. Acceptance of Terms</h2>
                            <p>
                                By accessing or using the Lettersheets platform ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not access or use the Service. These Terms apply to all users, including administrators, employees, and any other individuals who access the Service.
                            </p>
                        </section>

                        <section className="tos-section">
                            <h2>2. Description of Service</h2>
                            <p>
                                Lettersheets is a cloud-based human resources management platform that provides tools for employee management, attendance tracking, payroll processing, position management, and other HR-related functions. The Service is provided on a subscription basis and may include free and paid tiers.
                            </p>
                        </section>

                        <section className="tos-section">
                            <h2>3. Account Registration</h2>
                            <p>
                                To use the Service, you must create an account by providing accurate, current, and complete information. You are responsible for maintaining the confidentiality of your account credentials, including your password and recovery keys. You agree to notify us immediately of any unauthorized use of your account.
                            </p>
                            <p>
                                Each account is associated with a company entity. The individual who creates the company account is designated as the administrator and assumes responsibility for managing users, permissions, and company data within the platform.
                            </p>
                        </section>

                        <section className="tos-section">
                            <h2>4. Data Ownership and Privacy</h2>
                            <p>
                                You retain all ownership rights to the data you submit to the Service ("Your Data"). Lettersheets does not claim ownership of Your Data. We process Your Data solely to provide and improve the Service, in accordance with our <a href="/privacy" className="tos-link">Privacy Policy</a>.
                            </p>
                            <p>
                                Lettersheets employs post-quantum cryptography (PQC) and client-side encryption to protect sensitive company data. Certain database columns containing sensitive information — such as employee personal details, payroll data, and confidential records — are encrypted entirely on the client side before being transmitted to our servers. This means that Lettersheets servers store only ciphertext for these fields and have no ability to read, decrypt, or access the plaintext contents. Only authenticated users with valid credentials or recovery keys can decrypt and view protected data.
                            </p>
                        </section>

                        <section className="tos-section">
                            <h2>5. Encryption and Recovery Keys</h2>
                            <p>
                                Upon account creation, the Service generates post-quantum cryptographic keys using NIST-standardized algorithms, including ML-KEM (Module-Lattice Key Encapsulation) for key exchange and ML-DSA (Module-Lattice Digital Signature) for authentication. These algorithms are designed to resist attacks from both classical and quantum computers. Encryption keys are derived from your password on the client side and are never transmitted to or stored on our servers in plaintext.
                            </p>
                            <p>
                                A recovery key file is provided at registration, and it is your sole responsibility to store this file securely. Lettersheets cannot reset your password or decrypt your data without this recovery key. Because encrypted columns are decrypted exclusively on the client, our servers have zero knowledge of the underlying data.
                            </p>
                            <p>
                                By using the Service, you acknowledge and accept that the loss of both your password and recovery key will result in permanent and irreversible loss of access to your encrypted data. Lettersheets shall not be liable for any data loss resulting from lost credentials or recovery keys.
                            </p>
                        </section>

                        <section className="tos-section">
                            <h2>6. Acceptable Use</h2>
                            <p>You agree not to use the Service to:</p>
                            <ul>
                                <li>Violate any applicable law, regulation, or third-party rights</li>
                                <li>Upload or transmit malicious code, viruses, or harmful data</li>
                                <li>Attempt to gain unauthorized access to other accounts, systems, or networks</li>
                                <li>Interfere with or disrupt the integrity or performance of the Service</li>
                                <li>Use the Service for any fraudulent, deceptive, or misleading purpose</li>
                                <li>Reverse-engineer, decompile, or attempt to extract the source code of the Service</li>
                                <li>Store or process data that violates applicable data protection laws</li>
                            </ul>
                        </section>

                        <section className="tos-section">
                            <h2>7. Subscription and Payment</h2>
                            <p>
                                Certain features of the Service may require a paid subscription. Subscription fees are billed in advance on a monthly or annual basis, depending on the plan you select. All fees are non-refundable except as required by law or as explicitly stated in these Terms.
                            </p>
                            <p>
                                We reserve the right to modify pricing with at least 30 days' notice. Continued use of the Service after a price change constitutes acceptance of the new pricing.
                            </p>
                        </section>

                        <section className="tos-section">
                            <h2>8. Service Availability and Modifications</h2>
                            <p>
                                We strive to maintain the availability of the Service but do not guarantee uninterrupted or error-free operation. We may modify, suspend, or discontinue any part of the Service at any time, with or without notice. We will make reasonable efforts to notify users of significant changes.
                            </p>
                        </section>

                        <section className="tos-section">
                            <h2>9. Intellectual Property</h2>
                            <p>
                                The Service, including its design, code, features, documentation, and branding, is the intellectual property of Lettersheets and is protected by copyright, trademark, and other intellectual property laws. You are granted a limited, non-exclusive, non-transferable license to use the Service for its intended purpose during the term of your subscription.
                            </p>
                        </section>

                        <section className="tos-section">
                            <h2>10. Limitation of Liability</h2>
                            <p>
                                To the maximum extent permitted by applicable law, Lettersheets and its affiliates, officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, business opportunities, or goodwill, arising from your use of or inability to use the Service.
                            </p>
                            <p>
                                Our total aggregate liability for any claims arising from or relating to these Terms or the Service shall not exceed the amount you paid to Lettersheets in the twelve (12) months preceding the event giving rise to the claim.
                            </p>
                        </section>

                        <section className="tos-section">
                            <h2>11. Indemnification</h2>
                            <p>
                                You agree to indemnify, defend, and hold harmless Lettersheets and its affiliates from and against any claims, liabilities, damages, losses, and expenses, including reasonable legal fees, arising out of or in any way connected with your access to or use of the Service, your violation of these Terms, or your infringement of any third-party rights.
                            </p>
                        </section>

                        <section className="tos-section">
                            <h2>12. Termination</h2>
                            <p>
                                You may terminate your account at any time by contacting us or through your account settings. We may suspend or terminate your account if you violate these Terms, fail to pay applicable fees, or if we are required to do so by law.
                            </p>
                            <p>
                                Upon termination, your right to access the Service will immediately cease. We may retain certain data as required by law or for legitimate business purposes. Encrypted data that cannot be decrypted without your keys will be deleted in accordance with our data retention policy.
                            </p>
                        </section>

                        <section className="tos-section">
                            <h2>13. Governing Law</h2>
                            <p>
                                These Terms shall be governed by and construed in accordance with the laws of the Republic of the Philippines, without regard to its conflict of law provisions. Any disputes arising from or relating to these Terms shall be resolved in the courts of Makati City, Philippines.
                            </p>
                        </section>

                        <section className="tos-section">
                            <h2>14. Changes to These Terms</h2>
                            <p>
                                We reserve the right to update or modify these Terms at any time. We will notify you of material changes by posting the revised Terms on the Service and updating the "Effective Date" above. Your continued use of the Service following any changes constitutes acceptance of the updated Terms.
                            </p>
                        </section>

                        <section className="tos-section">
                            <h2>15. Contact Us</h2>
                            <p>
                                If you have questions or concerns about these Terms of Service, please contact us at:
                            </p>
                            <div className="tos-contact">
                                <p><strong>Lettersheets</strong></p>
                                <p>Email: legal@lettersheets.com</p>
                                <p>Website: www.lettersheets.com</p>
                            </div>
                        </section>

                    </div>

                    <div className="tos-footer">
                        <p>© {new Date().getFullYear()} Lettersheets. All rights reserved.</p>
                    </div>
                </div>
            </div>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');

                .tos-page {
                    min-height: 100vh;
                    background: #f5f5f0;
                    display: flex;
                    justify-content: center;
                    padding: 40px 20px;
                    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif;
                }

                .tos-container {
                    width: 100%;
                    max-width: 760px;
                    background: #fff;
                    border-radius: 24px;
                    padding: 56px 52px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                }

                .tos-header {
                    text-align: center;
                    margin-bottom: 48px;
                    padding-bottom: 32px;
                    border-bottom: 1px solid #e8e8e5;
                }

                .tos-logo {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    margin-bottom: 28px;
                }

                .tos-logo-text {
                    font-size: 18px;
                    font-weight: 400;
                    letter-spacing: 3px;
                    color: #1a1a1a;
                }

                .tos-logo-bold {
                    font-weight: 700;
                }

                .tos-title {
                    font-size: 28px;
                    font-weight: 700;
                    color: #1a1a1a;
                    margin-bottom: 8px;
                }

                .tos-effective {
                    font-size: 14px;
                    color: #999;
                    font-weight: 500;
                }

                .tos-content {
                    color: #333;
                    line-height: 1.75;
                }

                .tos-section {
                    margin-bottom: 32px;
                }

                .tos-section h2 {
                    font-size: 17px;
                    font-weight: 700;
                    color: #1a1a1a;
                    margin-bottom: 12px;
                }

                .tos-section p {
                    font-size: 14.5px;
                    color: #444;
                    margin-bottom: 12px;
                    line-height: 1.8;
                }

                .tos-section ul {
                    padding-left: 24px;
                    margin-bottom: 12px;
                }

                .tos-section li {
                    font-size: 14.5px;
                    color: #444;
                    margin-bottom: 8px;
                    line-height: 1.7;
                }

                .tos-link {
                    color: #2d6a4f;
                    text-decoration: underline;
                    font-weight: 500;
                }

                .tos-link:hover {
                    color: #1a5035;
                }

                .tos-contact {
                    background: #f9f9f7;
                    border: 1px solid #e8e8e5;
                    border-radius: 12px;
                    padding: 16px 20px;
                    margin-top: 8px;
                }

                .tos-contact p {
                    margin-bottom: 4px;
                    font-size: 14px;
                }

                .tos-footer {
                    text-align: center;
                    margin-top: 48px;
                    padding-top: 24px;
                    border-top: 1px solid #e8e8e5;
                }

                .tos-footer p {
                    font-size: 12px;
                    color: #bbb;
                }

                @media (max-width: 600px) {
                    .tos-container {
                        padding: 32px 24px;
                        border-radius: 20px;
                    }
                    .tos-title {
                        font-size: 24px;
                    }
                }
            `}</style>
        </>
    );
}
