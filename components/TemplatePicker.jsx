import { useState } from 'react';
import styles from '../styles/Career.module.css';

/**
 * Visual template picker for resumes and cover letters
 * Allows users to select from predefined templates with preview images
 */
export default function TemplatePicker({ type, onSelect, currentTemplate }) {
  const [selectedId, setSelectedId] = useState(currentTemplate || 'professional');

  const resumeTemplates = [
    {
      id: 'professional',
      name: 'Professional',
      preview: '📄',
      description: 'Clean, traditional format for corporate roles',
      formatTemplate: `Professional Resume Format:
- Contact info at top (Name, Email, Phone, Address)
- Professional Summary: 2-3 sentences
- Experience: Job Title | Company | Dates on one line, bullet points for details
- Education: Degree, School (Year)
- Skills: Comma-separated list
- Certifications: List format`
    },
    {
      id: 'modern',
      name: 'Modern',
      preview: '✨',
      description: 'Contemporary design with creative flair',
      formatTemplate: `Modern Resume Format:
- Name prominently displayed with contact info below
- Profile: Brief, impactful summary
- Key Skills section at top (3-5 highlights)
- Experience: Role — Company (Dates) with concise achievements
- Education & Certifications combined section
- Clean spacing, modern typography`
    },
    {
      id: 'technical',
      name: 'Technical',
      preview: '💻',
      description: 'Tech-focused with skills and projects emphasized',
      formatTemplate: `Technical Resume Format:
- Contact: Name, Email, Phone, LinkedIn, GitHub
- Technical Skills: Categorized (Languages, Frameworks, Tools)
- Professional Experience: Title | Company | Dates | Tech Stack
  - Bullet points with metrics and technologies
- Education: Degree, School, Year, GPA (if strong)
- Projects/Certifications: Name, Technologies, Brief description`
    },
    {
      id: 'minimalist',
      name: 'Minimalist',
      preview: '▪️',
      description: 'Simple, focused on content over design',
      formatTemplate: `Minimalist Resume Format:
- Name (large), Contact info (one line)
- Summary: One powerful sentence
- Experience: Company | Role | Dates
  - 2-3 key achievements per role
- Education: Degree • School • Year
- Skills: Brief, relevant list only
- No graphics, maximum white space`
    },
    {
      id: 'executive',
      name: 'Executive',
      preview: '🎯',
      description: 'Senior-level with leadership emphasis',
      formatTemplate: `Executive Resume Format:
- Name, Title/Brand Statement
- Executive Profile: 3-4 sentences highlighting leadership
- Core Competencies: Strategic skills grid
- Professional Experience: Company | Position | Dates
  - Leadership achievements with business impact metrics
  - Board positions, advisory roles
- Education: Degrees, Executive programs
- Professional Affiliations`
    },
    {
      id: 'creative',
      name: 'Creative',
      preview: '🎨',
      description: 'Bold design for creative industries',
      formatTemplate: `Creative Resume Format:
- Name styled prominently with tagline
- Visual skills representation
- Portfolio/Website link featured
- Experience: Role @ Company (Dates)
  - Creative projects and outcomes
  - Awards and recognition
- Skills: Design tools, creative techniques
- Education & Additional: Workshops, exhibitions`
    }
  ];

  const coverLetterTemplates = [
    {
      id: 'formal',
      name: 'Formal',
      preview: '📝',
      description: 'Traditional business letter format',
      formatTemplate: `Formal Cover Letter:
[Your Name]
[Address]
[City, State ZIP]
[Email] | [Phone]

[Date]

[Recipient Name]
[Title]
[Company]
[Address]

Dear [Recipient],

[Opening paragraph: Express interest, mention position]
[Body paragraph: Highlight relevant skills and experience]
[Closing: Express enthusiasm, call to action]

Sincerely,
[Your Name]`
    },
    {
      id: 'modern-letter',
      name: 'Modern',
      preview: '✉️',
      description: 'Contemporary, email-style approach',
      formatTemplate: `Modern Cover Letter:
Subject: Application for [Position]

Dear [Recipient],

Opening: Brief, attention-grabbing introduction about why you're excited about this role.

Value Proposition: 2-3 sentences on what you bring - specific skills, achievements, or unique perspective.

Connection: How your background aligns with company mission/culture.

Call to Action: Express interest in discussing further.

Best regards,
[Your Name]
[Email] | [Phone] | [LinkedIn]`
    },
    {
      id: 'storytelling',
      name: 'Storytelling',
      preview: '📖',
      description: 'Narrative approach highlighting journey',
      formatTemplate: `Storytelling Cover Letter:
Dear [Recipient],

Opening Hook: Start with a relevant story or insight that connects to the role.

The Journey: Briefly trace your path and pivotal moments that led you here.

Why This Role: Connect your story to why this specific position excites you.

What You'll Bring: Concrete skills and experiences tied back to narrative.

Looking Forward: Express enthusiasm for contributing.

Warm regards,
[Your Name]`
    },
    {
      id: 'bullet-points',
      name: 'Bullet Points',
      preview: '📌',
      description: 'Scannable format with key highlights',
      formatTemplate: `Bullet Point Cover Letter:
Re: [Position] Application

Dear [Recipient],

I am excited to apply for [Position]. Here's why I'm a strong fit:

• [Key Qualification 1]: Specific achievement or skill
• [Key Qualification 2]: Relevant experience with metrics
• [Key Qualification 3]: Unique value you bring

Why [Company]: One sentence on company alignment.

I would welcome the opportunity to discuss how I can contribute to [Company]'s success.

Best,
[Your Name]
[Contact Info]`
    }
  ];

  const templates = type === 'resume' ? resumeTemplates : coverLetterTemplates;

  const handleSelect = (template) => {
    setSelectedId(template.id);
    onSelect(template.formatTemplate, template.id);
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 18, marginBottom: 12, fontWeight: 600 }}>
        Choose a {type === 'resume' ? 'Resume' : 'Cover Letter'} Template
      </h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 16
      }}>
        {templates.map(template => (
          <div
            key={template.id}
            onClick={() => handleSelect(template)}
            style={{
              padding: 16,
              border: selectedId === template.id ? '2px solid var(--accent-color, #d4af37)' : '1px solid #333',
              borderRadius: 8,
              backgroundColor: selectedId === template.id ? 'rgba(212, 175, 55, 0.1)' : '#1a1a1a',
              cursor: 'pointer',
              transition: 'all 0.2s',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              if (selectedId !== template.id) {
                e.currentTarget.style.borderColor = '#555';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedId !== template.id) {
                e.currentTarget.style.borderColor = '#333';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 8 }}>
              {template.preview}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, textAlign: 'center', marginBottom: 4 }}>
              {template.name}
            </div>
            <div style={{ fontSize: 12, color: '#888', textAlign: 'center', lineHeight: 1.4 }}>
              {template.description}
            </div>
            {selectedId === template.id && (
              <div style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 20,
                height: 20,
                borderRadius: '50%',
                backgroundColor: 'var(--accent-color, #d4af37)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12
              }}>
                ✓
              </div>
            )}
          </div>
        ))}
      </div>
      
      {selectedId && (
        <details style={{ marginTop: 16, padding: 12, backgroundColor: '#0d0d0d', borderRadius: 8 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            📋 Preview Template Format
          </summary>
          <pre style={{
            marginTop: 12,
            padding: 12,
            backgroundColor: '#000',
            borderRadius: 4,
            fontSize: 12,
            lineHeight: 1.6,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            color: '#aaa'
          }}>
            {templates.find(t => t.id === selectedId)?.formatTemplate}
          </pre>
        </details>
      )}
    </div>
  );
}
